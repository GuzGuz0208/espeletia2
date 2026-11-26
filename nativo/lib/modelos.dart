// Catálogo de modelos (assets/modelos.json), descarga única con wifi e importación de un archivo copiado con adb push.
// Todo archivo se verifica por tamaño y SHA-256 antes de usarlo.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:path_provider/path_provider.dart';

class ModeloInfo {
  ModeloInfo.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        nombre = j['nombre'] as String,
        archivo = j['archivo'] as String,
        url = j['url'] as String,
        sha256 = (j['sha256'] as String).toLowerCase(),
        bytes = j['bytes'] as int,
        licencia = j['licencia'] as String,
        motor = j['motor'] as String,
        sinRazonar = j['sinRazonar'] as bool? ?? false;

  final String id, nombre, archivo, url, sha256, licencia, motor;
  final int bytes;
  final bool sinRazonar;

  bool get esLiteRt => motor == 'litertlm';
  String get tamano => '${(bytes / 1e9).toStringAsFixed(2)} GB';
}

Future<List<ModeloInfo>> leerCatalogo() async {
  final j = jsonDecode(await rootBundle.loadString('assets/modelos.json')) as Map<String, dynamic>;
  return (j['modelos'] as List).cast<Map<String, dynamic>>().map(ModeloInfo.fromJson).toList();
}

class _SumideroHuella implements Sink<Digest> {
  Digest? valor;
  @override
  void add(Digest data) => valor = data;
  @override
  void close() {}
}

/// SHA-256 de un archivo en otro isolate (un GGUF de 1-2 GB tarda decenas de segundos en el teléfono).
Future<String> huellaArchivo(String ruta) => Isolate.run(() async {
      final sumidero = _SumideroHuella();
      final entrada = sha256.startChunkedConversion(sumidero);
      await for (final trozo in File(ruta).openRead()) {
        entrada.add(trozo);
      }
      entrada.close();
      return sumidero.valor.toString();
    });

class CancelarDescarga {
  bool cancelado = false;
  HttpClient? _cliente;
  void cancelar() {
    cancelado = true;
    _cliente?.close(force: true);
  }
}

class Almacen {
  Almacen._();
  static final Almacen i = Almacen._();

  late Directory interno; // descargas: almacenamiento privado de la app
  Directory? externo; // importación: /sdcard/Android/data/<paquete>/files (adb push sin permisos)

  Future<void> iniciar() async {
    interno = Directory('${(await getApplicationSupportDirectory()).path}/modelos');
    await interno.create(recursive: true);
    try {
      externo = await getExternalStorageDirectory();
    } catch (_) {
      externo = null;
    }
  }

  File _destino(ModeloInfo m) => File('${interno.path}/${m.archivo}');
  File _marca(ModeloInfo m) => File('${interno.path}/${m.archivo}.verificado');
  File? _importable(ModeloInfo m) => externo == null ? null : File('${externo!.path}/${m.archivo}');
  File? _marcaImportado(ModeloInfo m) => externo == null ? null : File('${interno.path}/${m.archivo}.importado');

  /// Ruta lista para cargar (ya verificada), o null.
  Future<String?> rutaVerificada(ModeloInfo m) async {
    final d = _destino(m);
    if (await d.exists() && await _marca(m).exists() && (await _marca(m).readAsString()).trim() == m.sha256 &&
        await d.length() == m.bytes) {
      return d.path;
    }
    final imp = _importable(m), marcaImp = _marcaImportado(m);
    if (imp != null && marcaImp != null && await imp.exists() && await marcaImp.exists() &&
        (await marcaImp.readAsString()).trim() == m.sha256 && await imp.length() == m.bytes) {
      return imp.path;
    }
    return null;
  }

  /// Hay un archivo con el nombre esperado en la carpeta de importación (aún sin verificar).
  Future<bool> hayImportable(ModeloInfo m) async {
    final imp = _importable(m);
    return imp != null && await imp.exists();
  }

  String get carpetaImportar => externo?.path ?? '(sin almacenamiento externo)';

  /// Verifica el archivo copiado con adb push y lo usa en su sitio (no se duplica: son 0,5-2,6 GB).
  Future<String> importar(ModeloInfo m, void Function(String) estado) async {
    final imp = _importable(m);
    if (imp == null || !await imp.exists()) {
      throw Exception('No encontré ${m.archivo} en $carpetaImportar');
    }
    final largo = await imp.length();
    if (largo != m.bytes) throw Exception('Tamaño $largo B, se esperaban ${m.bytes} B (¿copia incompleta?)');
    estado('Verificando SHA-256…');
    final h = await huellaArchivo(imp.path);
    if (h != m.sha256) throw Exception('La huella SHA-256 no coincide ($h)');
    await _marcaImportado(m)!.writeAsString(m.sha256);
    return imp.path;
  }

  /// Descarga única (con wifi). Escribe en .part, verifica tamaño y huella y solo entonces lo deja listo.
  Future<String> descargar(ModeloInfo m, void Function(int hecho, int total) progreso, void Function(String) estado,
      CancelarDescarga cancelar) async {
    final parte = File('${_destino(m).path}.part');
    final cliente = HttpClient()..connectionTimeout = const Duration(seconds: 30);
    cancelar._cliente = cliente;
    try {
      final req = await cliente.getUrl(Uri.parse(m.url));
      req.followRedirects = true;
      req.maxRedirects = 10;
      final res = await req.close();
      if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode} al descargar ${m.archivo}');
      final total = res.contentLength > 0 ? res.contentLength : m.bytes;
      final sumidero = _SumideroHuella();
      final huella = sha256.startChunkedConversion(sumidero);
      final salida = parte.openWrite();
      var hecho = 0, ultimo = 0;
      try {
        await for (final trozo in res) {
          if (cancelar.cancelado) throw Exception('Descarga cancelada');
          salida.add(trozo);
          huella.add(trozo);
          hecho += trozo.length;
          if (hecho - ultimo > 4 << 20) {
            ultimo = hecho;
            progreso(hecho, total);
          }
        }
      } finally {
        await salida.close();
      }
      huella.close();
      progreso(hecho, total);
      estado('Verificando…');
      if (hecho != m.bytes) throw Exception('Llegaron $hecho B, se esperaban ${m.bytes} B');
      final h = sumidero.valor.toString();
      if (h != m.sha256) throw Exception('La huella SHA-256 no coincide ($h)');
      await parte.rename(_destino(m).path);
      await _marca(m).writeAsString(m.sha256);
      return _destino(m).path;
    } catch (e) {
      if (await parte.exists()) await parte.delete();
      rethrow;
    } finally {
      cliente.close(force: true);
    }
  }

  Future<void> borrar(ModeloInfo m) async {
    for (final f in [_destino(m), _marca(m), File('${_destino(m).path}.part'), if (_marcaImportado(m) != null) _marcaImportado(m)!]) {
      if (await f.exists()) await f.delete();
    }
  }
}
