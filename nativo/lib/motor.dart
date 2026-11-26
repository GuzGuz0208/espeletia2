// Motor nativo: un solo GGUF cargado a la vez con llamadart (llama.cpp, CPU). Lo usan el puente window.FrayNativo y la
// prueba de velocidad de los ajustes. Una generación a la vez, en cola.
//
// Parámetros (assets/modelo.json, sección «motor»): n_ctx 2048, hilos = núcleos grandes, temperatura 0, ~70 tokens.
// Al cargar se «calienta» con el prompt del sistema: llamadart reutiliza el prefijo común (reusePromptPrefix) y así cada
// pregunta solo procesa sus tokens nuevos. En Qwen3/3.5 se desactiva el razonamiento (enableThinking: false).
import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:llamadart/llamadart.dart';

import 'modelos.dart';

class Generacion {
  Generacion({
    required this.texto,
    required this.primeraPalabraMs,
    required this.totalMs,
    required this.tokens,
    required this.cortado,
    this.error,
  });
  final String texto;
  final int primeraPalabraMs; // -1 si no salió ninguna palabra
  final int totalMs;
  final int tokens;
  final bool cortado; // tiempo máximo, límite de tokens o cancelado
  final String? error;

  double get tokensPorSegundo {
    final ms = totalMs - (primeraPalabraMs < 0 ? 0 : primeraPalabraMs);
    return tokens > 1 && ms > 0 ? (tokens - 1) * 1000 / ms : 0;
  }
}

final _rePensar = RegExp(r'<think>[\s\S]*?(</think>|$)');

/// Quita un bloque `<think>…</think>` si el modelo lo escribe aunque se le pidió no razonar.
String limpiarRespuesta(String s) => s.replaceAll(_rePensar, '').trim();

/// Núcleos grandes: los que tienen la frecuencia máxima por encima del grupo más lento (big.LITTLE). Entre 2 y 4; si no
/// se puede leer /sys, 4.
int nucleosGrandes() {
  try {
    final f = <int>[];
    for (var i = 0; i < Platform.numberOfProcessors; i++) {
      final a = File('/sys/devices/system/cpu/cpu$i/cpufreq/cpuinfo_max_freq');
      if (a.existsSync()) f.add(int.parse(a.readAsStringSync().trim()));
    }
    if (f.length < 2) return 4;
    final minimo = f.reduce((a, b) => a < b ? a : b);
    final grandes = f.where((x) => x > minimo).length;
    return (grandes == 0 ? 4 : grandes).clamp(2, 4);
  } catch (_) {
    return 4;
  }
}

class Motor extends ChangeNotifier {
  Motor._();
  static final Motor i = Motor._();

  LlamaEngine? _engine;
  ModeloInfo? modelo;
  String backendReal = '';
  int? cargaMs, calentarMs;
  int hilos = 4;
  int nCtx = 2048;
  bool cargando = false;
  String? error;
  int? rssTrasCargaMB;

  /// Mensajes del prompt del sistema con los que se calienta la caché (los pone el puente).
  List<LlamaChatMessage> Function()? mensajesCalentar;

  Future<void> _cola = Future.value();
  Completer<void>? _carga;
  String? _idActual;
  final Set<String> _cancelados = {};

  bool get listo => _engine != null && modelo != null && !cargando;

  static int rssMB() => (ProcessInfo.currentRss / (1 << 20)).round();
  static int rssMaxMB() => (ProcessInfo.maxRss / (1 << 20)).round();

  /// Espera a que termine una carga en curso (como mucho [max]). Devuelve si quedó listo.
  Future<bool> esperarListo(Duration max) async {
    final c = _carga;
    if (c != null && !c.isCompleted) {
      try {
        await c.future.timeout(max);
      } catch (_) {}
    }
    return listo;
  }

  /// Carga el modelo en CPU y calienta el prompt del sistema.
  Future<void> cargar(ModeloInfo m, String ruta, {required int hilos, int nCtx = 2048}) async {
    if (cargando) throw StateError('Ya hay una carga en curso');
    cargando = true;
    error = null;
    _carga = Completer<void>();
    notifyListeners();
    await _cola; // que no haya una generación en curso
    final sw = Stopwatch()..start();
    try {
      await _soltar();
      this.hilos = hilos;
      this.nCtx = nCtx;
      final engine = LlamaEngine(LlamaBackend());
      await engine.setModel(
        LlamaModel(ModelSource.path(ruta)),
        params: LlamaCppModelParams(
          contextSize: nCtx,
          device: ComputeDevice.cpu,
          preferredBackend: GpuBackend.cpu,
          gpuLayers: 0,
          numberOfThreads: hilos,
          numberOfThreadsBatch: hilos,
        ),
      );
      _engine = engine;
      modelo = m;
      backendReal = await engine.getBackendName();
      cargaMs = sw.elapsedMilliseconds;
      // Calentar: procesa el prompt del sistema una vez (1 token) para que quede en la caché KV.
      final msgs = mensajesCalentar?.call();
      if (msgs != null) {
        final s2 = Stopwatch()..start();
        try {
          await for (final _ in engine.create(msgs,
              params: const GenerationParams(maxTokens: 1, temp: 0, topK: 1, topP: 1, penalty: 1.0, seed: 42),
              enableThinking: !m.sinRazonar)) {}
        } catch (_) {/* si falla el calentamiento, la primera pregunta solo tarda más */}
        calentarMs = s2.elapsedMilliseconds;
      }
      rssTrasCargaMB = rssMB();
    } catch (e) {
      error = 'No cargó: $e';
      await _soltar();
      rethrow;
    } finally {
      cargando = false;
      _carga?.complete();
      notifyListeners();
    }
  }

  Future<void> _soltar() async {
    final e = _engine;
    _engine = null;
    modelo = null;
    backendReal = '';
    cargaMs = null;
    if (e != null) await e.dispose();
  }

  Future<void> descargarDeMemoria() async {
    await _cola;
    await _soltar();
    notifyListeners();
  }

  /// Genera en cola. Corta por tiempo (timeoutMs) o por límite de tokens; nunca lanza: los errores van en
  /// [Generacion.error].
  Future<Generacion> generar(
    List<LlamaChatMessage> mensajes, {
    required String id,
    int maxTokens = 70,
    int timeoutMs = 6000,
    void Function(String trozo)? alTrozo,
  }) {
    final c = Completer<Generacion>();
    _cola = _cola.then((_) async {
      c.complete(await _generarAhora(mensajes, id: id, maxTokens: maxTokens, timeoutMs: timeoutMs, alTrozo: alTrozo));
    });
    return c.future;
  }

  Future<Generacion> _generarAhora(
    List<LlamaChatMessage> mensajes, {
    required String id,
    required int maxTokens,
    required int timeoutMs,
    void Function(String trozo)? alTrozo,
  }) async {
    final engine = _engine, m = modelo;
    if (engine == null || m == null) {
      return Generacion(texto: '', primeraPalabraMs: -1, totalMs: 0, tokens: 0, cortado: false, error: 'modelo no cargado');
    }
    if (_cancelados.remove(id)) {
      return Generacion(texto: '', primeraPalabraMs: -1, totalMs: 0, tokens: 0, cortado: true, error: 'cancelado');
    }
    _idActual = id;
    final sw = Stopwatch()..start();
    final buf = StringBuffer();
    var primera = -1, trozos = 0;
    var cortado = false;
    int? tokensUso;
    String? err;
    final reloj = Timer(Duration(milliseconds: timeoutMs), () {
      cortado = true;
      engine.cancelGeneration();
    });
    try {
      final flujo = engine.create(
        mensajes,
        params: GenerationParams(
            maxTokens: maxTokens, temp: 0, topK: 1, topP: 1, penalty: 1.0, seed: 42, streamBatchTokenThreshold: 2),
        enableThinking: !m.sinRazonar,
      );
      await for (final ch in flujo) {
        final t = ch.text;
        if (t.isNotEmpty) {
          if (primera < 0) primera = sw.elapsedMilliseconds;
          trozos++;
          buf.write(t);
          alTrozo?.call(t);
        }
        if (ch.usage != null) tokensUso = ch.usage!.completionTokens;
        if (ch.finishReason == LlamaFinishReason.length) cortado = true;
      }
    } catch (e) {
      err = '$e';
    } finally {
      reloj.cancel();
      _idActual = null;
    }
    if (_cancelados.remove(id)) cortado = true;
    return Generacion(
      texto: limpiarRespuesta(buf.toString()),
      primeraPalabraMs: primera,
      totalMs: sw.elapsedMilliseconds,
      tokens: tokensUso ?? trozos,
      cortado: cortado,
      error: err,
    );
  }

  /// Cancela la generación [id] si está corriendo o en cola.
  void cancelar(String id) {
    _cancelados.add(id);
    if (_idActual == id) _engine?.cancelGeneration();
  }

  void detenerTodo() {
    if (_idActual != null) _cancelados.add(_idActual!);
    _engine?.cancelGeneration();
  }
}
