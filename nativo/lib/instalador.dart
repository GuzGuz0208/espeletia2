// Instalación automática de la IA local. Al abrir la app:
//   1. si el GGUF del modelo elegido ya está verificado en el teléfono → se precarga (y se calienta el prompt del sistema);
//   2. si alguien lo copió con adb a la carpeta de importación → se verifica y se usa;
//   3. si no, se descarga solo (reanudable, con reintentos) cuando haya señal, se verifica SHA-256 y tamaño, y se precarga.
// Mientras tanto Fray responde igual con el texto del guion (respuesta extractiva de la PWA).
import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';

import 'modelos.dart';
import 'motor.dart';

enum EstadoIA { revisando, descargando, esperandoRed, verificando, cargando, lista, pausada, error }

class Instalador extends ChangeNotifier {
  Instalador._();
  static final Instalador i = Instalador._();

  Catalogo? catalogo;
  ModeloInfo? modelo;
  EstadoIA estado = EstadoIA.revisando;
  int hecho = 0, total = 0;
  String detalle = '';
  String? error;
  int? hilosElegidos; // null = automático
  bool instalado = false;
  /// El modelo ya estaba instalado al abrir la app (si no, la PWA debe recargarse para usarlo).
  bool instaladoAlAbrir = false;
  bool _primera = true;
  bool _corriendo = false;
  CancelarDescarga? _cancelar;
  Timer? _reintento;
  int _fallos = 0;

  ParamsMotor? get params => catalogo?.motor;
  double? get progreso => total > 0 ? hecho / total : null;
  int get hilos => hilosElegidos ?? params?.hilos ?? nucleosGrandes();

  Map<String, dynamic> resumen() => {
        'estado': estado.name,
        'modelo': modelo?.id,
        'hecho': hecho,
        'total': total,
        if (error != null) 'error': error,
      };

  void _poner(EstadoIA e, [String d = '']) {
    estado = e;
    detalle = d;
    notifyListeners();
  }

  Future<void> iniciar() async {
    await Almacen.i.iniciar();
    catalogo = await Catalogo.leer();
    final prefs = await Almacen.i.leerPrefs();
    modelo = catalogo!.porId(prefs['modelo'] as String?) ?? catalogo!.porId(catalogo!.porDefecto);
    hilosElegidos = prefs['hilos'] is int ? prefs['hilos'] as int : null;
    await asegurar();
  }

  /// Revisa, importa o descarga, y carga. Idempotente.
  Future<void> asegurar() async {
    final m = modelo;
    if (m == null || _corriendo) return;
    _corriendo = true;
    _reintento?.cancel();
    error = null;
    try {
      _poner(EstadoIA.revisando);
      var ruta = await Almacen.i.rutaVerificada(m);
      if (_primera && ruta != null) instaladoAlAbrir = true;
      _primera = false;
      if (ruta == null && await Almacen.i.hayImportable(m)) {
        _poner(EstadoIA.verificando, 'Verificando el archivo copiado…');
        ruta = await Almacen.i.importarDeCarpeta(m, (s) => _poner(EstadoIA.verificando, s));
      }
      if (ruta == null) {
        total = m.bytes;
        hecho = await Almacen.i.parcial(m);
        _poner(EstadoIA.descargando);
        _cancelar = CancelarDescarga();
        ruta = await Almacen.i.descargar(m, (h, t) {
          hecho = h;
          total = t;
          if (estado != EstadoIA.descargando) estado = EstadoIA.descargando;
          notifyListeners();
        }, (s) => _poner(EstadoIA.verificando, s), _cancelar!);
        _cancelar = null;
      }
      instalado = true;
      _fallos = 0;
      await _cargar(m, ruta);
    } on ErrorDefinitivo catch (e) {
      error = e.mensaje;
      _poner(EstadoIA.error);
    } catch (e) {
      if (_cancelar?.cancelado == true) {
        _poner(EstadoIA.pausada);
      } else if (instalado) {
        error = '$e';
        _poner(EstadoIA.error);
      } else {
        // Sin señal o se cortó: se reintenta solo (10 s, 20 s, 40 s… hasta 2 min) y se reanuda donde iba.
        _fallos++;
        final espera = Duration(seconds: min(120, 10 * pow(2, min(_fallos - 1, 4)).toInt()));
        error = '$e';
        _poner(EstadoIA.esperandoRed, 'Reintento en ${espera.inSeconds} s');
        _reintento = Timer(espera, asegurar);
      }
    } finally {
      _corriendo = false;
      _cancelar = null;
    }
  }

  Future<void> _cargar(ModeloInfo m, String ruta) async {
    if (Motor.i.listo && Motor.i.modelo?.id == m.id) {
      _poner(EstadoIA.lista);
      return;
    }
    _poner(EstadoIA.cargando);
    await Motor.i.cargar(m, ruta, hilos: hilos, nCtx: params?.nCtx ?? 2048);
    _poner(EstadoIA.lista);
  }

  void pausar() {
    _reintento?.cancel();
    _cancelar?.cancelar();
    if (estado == EstadoIA.esperandoRed) _poner(EstadoIA.pausada);
  }

  /// Reintenta ya (por ejemplo, al volver a la app o al llegar a una estación con señal).
  void reintentarYa() {
    if (estado == EstadoIA.esperandoRed || estado == EstadoIA.pausada || estado == EstadoIA.error) {
      _fallos = 0;
      unawaited(asegurar());
    }
  }

  Future<void> elegirModelo(String id) async {
    final m = catalogo?.porId(id);
    if (m == null || m.id == modelo?.id) return;
    pausar();
    while (_corriendo) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    await Motor.i.descargarDeMemoria();
    modelo = m;
    instalado = false;
    hecho = 0;
    total = 0;
    await Almacen.i.guardarPrefs({...await Almacen.i.leerPrefs(), 'modelo': id});
    unawaited(asegurar());
  }

  Future<void> elegirHilos(int? h) async {
    hilosElegidos = h;
    await Almacen.i.guardarPrefs({...await Almacen.i.leerPrefs(), 'hilos': h});
    final m = modelo;
    if (m != null && instalado) {
      final ruta = await Almacen.i.rutaVerificada(m);
      if (ruta != null) {
        await Motor.i.descargarDeMemoria();
        await _cargar(m, ruta);
      }
    }
    notifyListeners();
  }

  Future<void> borrarModelo() async {
    final m = modelo;
    if (m == null) return;
    pausar();
    await Motor.i.descargarDeMemoria();
    await Almacen.i.borrar(m);
    instalado = false;
    hecho = 0;
    _poner(EstadoIA.pausada, 'Modelo borrado. Toca «Descargar» para bajarlo otra vez.');
  }

  /// Importa un GGUF elegido con el selector de archivos.
  Future<void> importarArchivo(int largo, Stream<List<int>> Function() abrir) async {
    final cat = catalogo;
    if (cat == null) return;
    pausar();
    while (_corriendo) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    _corriendo = true;
    try {
      _poner(EstadoIA.verificando, 'Copiando y verificando…');
      final m = await Almacen.i.importarArchivo(largo, abrir, cat.modelos, (s) => _poner(EstadoIA.verificando, s));
      if (m.id != modelo?.id) {
        await Motor.i.descargarDeMemoria();
        modelo = m;
        await Almacen.i.guardarPrefs({...await Almacen.i.leerPrefs(), 'modelo': m.id});
      }
      instalado = true;
      await _cargar(m, (await Almacen.i.rutaVerificada(m))!);
    } catch (e) {
      error = '$e';
      _poner(EstadoIA.error);
    } finally {
      _corriendo = false;
    }
  }

  /// Texto corto para la barra de estado.
  String get textoBarra {
    switch (estado) {
      case EstadoIA.revisando:
        return 'Revisando la IA local…';
      case EstadoIA.descargando:
        final p = progreso == null ? '' : ' ${(progreso! * 100).toStringAsFixed(0)} %';
        return 'Descargando la IA local…$p (${(hecho / 1e6).toStringAsFixed(0)} de ${(total / 1e6).toStringAsFixed(0)} MB)';
      case EstadoIA.esperandoRed:
        return 'Descargando la IA local… sin señal, sigue en una estación con Starlink. $detalle';
      case EstadoIA.verificando:
        return detalle.isEmpty ? 'Verificando la IA local…' : detalle;
      case EstadoIA.cargando:
        return 'Preparando la IA local…';
      case EstadoIA.lista:
        return 'IA local lista · ${modelo?.nombre ?? ''} · sin internet';
      case EstadoIA.pausada:
        return detalle.isEmpty ? 'Descarga de la IA local en pausa' : detalle;
      case EstadoIA.error:
        return 'IA local no disponible: ${error ?? ''}';
    }
  }
}
