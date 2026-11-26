// Modelo de la IA local: catálogo (assets/modelo.json o su reemplazo copiado con adb), descarga reanudable con verificación
// de tamaño y SHA-256, e importación de un GGUF copiado por USB o adb push. Todo archivo se verifica antes de usarlo.
//
// La única conexión de la app es esta descarga (una vez, con señal: hotel, Brisas o una estación con Starlink).
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/services.dart' show rootBundle;
import 'package:path_provider/path_provider.dart';

class ModeloInfo {
  ModeloInfo.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        nombre = j['nombre'] as String,
        archivo = j['archivo'] as String,
        url = j['url'] as String,
        sha256 = (j['sha256'] as String).toLowerCase(),
        bytes = (j['bytes'] as num).toInt(),
        licencia = j['licencia'] as String? ?? '',
        sinRazonar = j['sinRazonar'] as bool? ?? false,
        nota = j['nota'] as String? ?? '' {
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(sha256)) throw FormatException('sha256 inválido en $id');
    if (archivo.contains('/') || archivo.contains('\\') || archivo.contains('..')) {
      throw FormatException('archivo inválido en $id');
    }
    if (!url.startsWith('https://')) throw FormatException('la url de $id debe ser https');
  }

  final String id, nombre, archivo, url, sha256, licencia, nota;
  final int bytes;
  final bool sinRazonar;

  String get tamano => '${(bytes / 1e6).toStringAsFixed(0)} MB';
}

/// Parámetros del motor (sección «motor» de modelo.json).
class ParamsMotor {
  ParamsMotor.fromJson(Map<String, dynamic> j)
      : nCtx = (j['nCtx'] as num? ?? 2048).toInt(),
        hilos = j['hilos'] is num ? (j['hilos'] as num).toInt() : null,
        temperatura = (j['temperatura'] as num? ?? 0).toDouble(),
        maxTokens = (j['maxTokens'] as num? ?? 70).toInt(),
        timeoutMs = (j['timeoutMs'] as num? ?? 6000).toInt();
  final int nCtx;
  final int? hilos; // null = «auto» (núcleos grandes)
  final double temperatura;
  final int maxTokens, timeoutMs;
}

class Catalogo {
  Catalogo._(this.modelos, this.porDefecto, this.motor, this.origen);
  final List<ModeloInfo> modelos;
  final String porDefecto;
  final ParamsMotor motor;
  final String origen; // 'app' o la ruta del reemplazo

  ModeloInfo? porId(String? id) {
    for (final m in modelos) {
      if (m.id == id) return m;
    }
    return null;
  }

  static Catalogo _desde(Map<String, dynamic> j, String origen) {
    final modelos = (j['modelos'] as List).cast<Map<String, dynamic>>().map(ModeloInfo.fromJson).toList();
    if (modelos.isEmpty) throw const FormatException('sin modelos');
    final pd = j['porDefecto'] as String? ?? modelos.first.id;
    return Catalogo._(modelos, modelos.any((m) => m.id == pd) ? pd : modelos.first.id,
        ParamsMotor.fromJson((j['motor'] as Map?)?.cast<String, dynamic>() ?? const {}), origen);
  }

  /// assets/modelo.json (empaquetado y firmado con el APK). Si alguien copió con adb un modelo.json a la carpeta de
  /// importación, en release **solo puede elegir** `porDefecto` entre los ids empaquetados (nunca cambia url, sha256 ni
  /// bytes: la integridad del modelo siempre sale del APK). El reemplazo completo solo vale en compilaciones de depuración.
  static Future<Catalogo> leer() async {
    final base = _desde(jsonDecode(await rootBundle.loadString('assets/modelo.json')) as Map<String, dynamic>, 'app');
    final ext = Almacen.i.externo;
    if (ext == null) return base;
    final f = File('${ext.path}/modelo.json');
    try {
      if (!await f.exists()) return base;
      final j = jsonDecode(await f.readAsString()) as Map<String, dynamic>;
      if (kDebugMode && j['modelos'] is List) return _desde(j, f.path);
      final pd = j['porDefecto'];
      if (pd is String && base.porId(pd) != null) return Catalogo._(base.modelos, pd, base.motor, 'app (porDefecto: $pd)');
    } catch (_) {/* reemplazo inválido: se usa el de la app */}
    return base;
  }
}

class _SumideroHuella implements Sink<Digest> {
  Digest? valor;
  @override
  void add(Digest data) => valor = data;
  @override
  void close() {}
}

/// SHA-256 de un archivo en otro isolate (un GGUF de 0,5-1 GB tarda unos segundos en el teléfono).
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

/// Error que no se arregla reintentando (huella distinta, 404…).
class ErrorDefinitivo implements Exception {
  ErrorDefinitivo(this.mensaje);
  final String mensaje;
  @override
  String toString() => mensaje;
}

class Almacen {
  Almacen._();
  static final Almacen i = Almacen._();

  late Directory interno; // almacenamiento privado de la app (se borra al desinstalar)
  Directory? externo; // /sdcard/Android/data/co.fray.paramo/files: adb push sin permisos

  Future<void> iniciar() async {
    interno = Directory('${(await getApplicationSupportDirectory()).path}/modelos');
    await interno.create(recursive: true);
    try {
      externo = await getExternalStorageDirectory();
      await externo?.create(recursive: true);
    } catch (_) {
      externo = null;
    }
  }

  File _destino(ModeloInfo m) => File('${interno.path}/${m.archivo}');
  File _marca(ModeloInfo m) => File('${interno.path}/${m.archivo}.verificado');
  File _parte(ModeloInfo m) => File('${interno.path}/${m.archivo}.part');
  File? _importable(ModeloInfo m) => externo == null ? null : File('${externo!.path}/${m.archivo}');

  String get carpetaImportar => externo?.path ?? '(sin almacenamiento externo)';

  /// Ruta lista para cargar (verificada con SHA-256 una vez; aquí solo se comprueba el tamaño), o null.
  Future<String?> rutaVerificada(ModeloInfo m) async {
    final d = _destino(m), marca = _marca(m);
    if (await d.exists() && await marca.exists() && (await marca.readAsString()).trim() == m.sha256 &&
        await d.length() == m.bytes) {
      return d.path;
    }
    return null; // nunca se carga en sitio desde el almacenamiento externo (otra app con permisos podría cambiarlo)
  }

  /// Bytes ya descargados de una descarga a medias (para reanudar).
  Future<int> parcial(ModeloInfo m) async {
    final p = _parte(m);
    return await p.exists() ? await p.length() : 0;
  }

  /// Hay un archivo con el nombre esperado en la carpeta de importación (aún sin verificar).
  Future<bool> hayImportable(ModeloInfo m) async {
    final imp = _importable(m);
    return imp != null && await imp.exists() && await imp.length() == m.bytes;
  }

  /// Copia el archivo dejado con adb push a la memoria privada de la app, verificando tamaño y SHA-256 contra el catálogo
  /// empaquetado mientras copia; si coincide, lo deja listo y borra la copia externa (no se duplican 0,5-1,3 GB).
  Future<String> importarDeCarpeta(ModeloInfo m, void Function(String) estado) async {
    final imp = _importable(m);
    if (imp == null || !await imp.exists()) throw ErrorDefinitivo('No encontré ${m.archivo} en $carpetaImportar');
    final largo = await imp.length();
    if (largo != m.bytes) throw ErrorDefinitivo('Tamaño $largo B, se esperaban ${m.bytes} B (¿copia incompleta?)');
    await importarArchivo(largo, () => imp.openRead(), [m], estado);
    try {
      await imp.delete();
    } catch (_) {}
    return _destino(m).path;
  }

  /// Importa un GGUF elegido con el selector de archivos (USB, Descargas…). Se reconoce por su tamaño y su huella y se
  /// copia a la memoria privada de la app. Devuelve el modelo reconocido.
  Future<ModeloInfo> importarArchivo(int largo, Stream<List<int>> Function() abrir, List<ModeloInfo> catalogo,
      void Function(String) estado) async {
    final candidatos = catalogo.where((m) => m.bytes == largo).toList();
    if (candidatos.isEmpty) throw ErrorDefinitivo('Ese archivo ($largo B) no es ninguno de los modelos de modelo.json');
    final m = candidatos.first;
    final tmp = File('${interno.path}/${m.archivo}.importando');
    final sumidero = _SumideroHuella();
    final huella = sha256.startChunkedConversion(sumidero);
    final salida = tmp.openWrite();
    var hecho = 0, ultimo = 0;
    try {
      await for (final t in abrir()) {
        salida.add(t);
        huella.add(t);
        hecho += t.length;
        if (hecho - ultimo > 16 << 20) {
          ultimo = hecho;
          estado('Copiando ${(hecho / 1e6).toStringAsFixed(0)} de ${(largo / 1e6).toStringAsFixed(0)} MB…');
        }
      }
    } finally {
      await salida.close();
    }
    huella.close();
    if (hecho != m.bytes || sumidero.valor.toString() != m.sha256) {
      await tmp.delete();
      throw ErrorDefinitivo('La huella SHA-256 no coincide con ${m.nombre}');
    }
    await tmp.rename(_destino(m).path);
    await _marca(m).writeAsString(m.sha256);
    return m;
  }

  /// Descarga reanudable: escribe en .part y, si se corta, la próxima vez pide solo lo que falta (HTTP Range). Al terminar
  /// verifica tamaño y SHA-256 y solo entonces deja el archivo listo. Los errores de red se reintentan; los de huella o
  /// de URL son [ErrorDefinitivo] (la huella distinta borra lo descargado).
  Future<String> descargar(ModeloInfo m, void Function(int hecho, int total) progreso, void Function(String) estado,
      CancelarDescarga cancelar) async {
    final parte = _parte(m);
    var inicio = await parte.exists() ? await parte.length() : 0;
    if (inicio > m.bytes) {
      await parte.delete();
      inicio = 0;
    }
    if (inicio < m.bytes) {
      final cliente = HttpClient()
        ..connectionTimeout = const Duration(seconds: 20)
        ..idleTimeout = const Duration(seconds: 20)
        ..userAgent = 'fray-paramo';
      cancelar._cliente = cliente;
      try {
        // Redirecciones a mano: Hugging Face manda al CDN y hay que repetir el Range en cada salto.
        var uri = Uri.parse(m.url);
        HttpClientResponse? res;
        for (var saltos = 0; saltos < 10; saltos++) {
          final req = await cliente.getUrl(uri);
          req.followRedirects = false;
          if (inicio > 0) req.headers.set(HttpHeaders.rangeHeader, 'bytes=$inicio-');
          final r = await req.close();
          if (r.statusCode >= 300 && r.statusCode < 400) {
            final loc = r.headers.value(HttpHeaders.locationHeader);
            await r.drain<void>();
            if (loc == null) throw Exception('Redirección sin destino');
            uri = uri.resolve(loc);
            continue;
          }
          res = r;
          break;
        }
        if (res == null) throw Exception('Demasiadas redirecciones');
        if (res.statusCode == 416) {
          await res.drain<void>(); // ya estaba completo: se verifica abajo
        } else {
          if (res.statusCode == 404 || res.statusCode == 403 || res.statusCode == 401) {
            await res.drain<void>();
            throw ErrorDefinitivo('HTTP ${res.statusCode}: el modelo no está en ${m.url}');
          }
          if (res.statusCode != 200 && res.statusCode != 206) {
            await res.drain<void>();
            throw Exception('HTTP ${res.statusCode}');
          }
          var modo = FileMode.append;
          if (res.statusCode == 200 || !_rangoEmpiezaEn(res, inicio)) {
            inicio = 0; // el servidor no reanudó: se empieza de cero
            modo = FileMode.write;
          }
          final salida = parte.openWrite(mode: modo);
          var hecho = inicio, ultimo = 0;
          final reloj = Stopwatch()..start();
          try {
            await for (final trozo in res.timeout(const Duration(seconds: 30))) {
              if (cancelar.cancelado) throw Exception('Descarga en pausa');
              salida.add(trozo);
              hecho += trozo.length;
              if (hecho > m.bytes) throw ErrorDefinitivo('Llegan más bytes de los esperados');
              if (reloj.elapsedMilliseconds - ultimo > 300) {
                ultimo = reloj.elapsedMilliseconds;
                progreso(hecho, m.bytes);
              }
            }
          } finally {
            await salida.flush();
            await salida.close();
          }
          progreso(hecho, m.bytes);
        }
      } on ErrorDefinitivo {
        if (await parte.exists()) await parte.delete();
        rethrow;
      } finally {
        cliente.close(force: true);
      }
    }
    final largo = await parte.exists() ? await parte.length() : 0;
    if (largo != m.bytes) throw Exception('Descarga incompleta: $largo de ${m.bytes} B (se reanuda)');
    estado('Verificando la huella SHA-256…');
    final h = await huellaArchivo(parte.path);
    if (h != m.sha256) {
      await parte.delete();
      throw ErrorDefinitivo('La huella SHA-256 no coincide: se borró la descarga');
    }
    await parte.rename(_destino(m).path);
    await _marca(m).writeAsString(m.sha256);
    return _destino(m).path;
  }

  bool _rangoEmpiezaEn(HttpClientResponse r, int inicio) {
    final cr = r.headers.value(HttpHeaders.contentRangeHeader); // bytes 123-456/789
    final mm = cr == null ? null : RegExp(r'bytes\s+(\d+)-').firstMatch(cr);
    return mm != null && int.parse(mm[1]!) == inicio;
  }

  Future<void> borrar(ModeloInfo m) async {
    for (final f in [_destino(m), _marca(m), _parte(m), File('${interno.path}/${m.archivo}.importando')]) {
      if (await f.exists()) await f.delete();
    }
  }

  /// Preferencias pequeñas (modelo elegido, hilos) en un JSON propio: sin dependencias extra.
  File get _prefs => File('${interno.path}/preferencias.json');
  Future<Map<String, dynamic>> leerPrefs() async {
    try {
      return jsonDecode(await _prefs.readAsString()) as Map<String, dynamic>;
    } catch (_) {
      return {};
    }
  }

  Future<void> guardarPrefs(Map<String, dynamic> p) => _prefs.writeAsString(jsonEncode(p));
}
