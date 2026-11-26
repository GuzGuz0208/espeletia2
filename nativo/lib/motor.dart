// Motor nativo: un solo modelo cargado a la vez (llamadart: llama.cpp para GGUF, LiteRT-LM para .litertlm).
// Lo comparten el Laboratorio y el puente window.FrayNativo. Una generación a la vez, en cola.
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
  final bool cortado; // timeout, límite de tokens o Detener
  final String? error;

  double get tokensPorSegundo {
    final ms = totalMs - (primeraPalabraMs < 0 ? 0 : primeraPalabraMs);
    return tokens > 1 && ms > 0 ? (tokens - 1) * 1000 / ms : 0;
  }
}

final _rePensar = RegExp(r'<think>[\s\S]*?(</think>|$)');

/// Quita un bloque `<think>…</think>` si el modelo lo escribe aunque se le pidió no razonar.
String limpiarRespuesta(String s) => s.replaceAll(_rePensar, '').trim();

class Motor extends ChangeNotifier {
  Motor._();
  static final Motor i = Motor._();

  LlamaEngine? _engine;
  ModeloInfo? modelo;
  String? rutaModelo;
  String backendPedido = 'cpu';
  String backendReal = '';
  int? cargaMs;
  int hilos = 4;
  bool cargando = false;
  String? error;
  int? rssTrasCargaMB;

  Future<void> _cola = Future.value();
  String? _idActual;
  final Set<String> _cancelados = {};

  bool get listo => _engine != null && modelo != null && !cargando;
  String get nombreMotor => modelo?.esLiteRt == true ? 'litert-lm' : 'llama.cpp';
  bool get enGpu {
    final b = backendReal.toLowerCase();
    return b.contains('gpu') || b.contains('vulkan') || b.contains('opencl');
  }

  static int rssMB() => (ProcessInfo.currentRss / (1 << 20)).round();
  static int rssMaxMB() => (ProcessInfo.maxRss / (1 << 20)).round();

  ModelParams _params(ModeloInfo m, bool gpu, int hilos) {
    final device = gpu ? ComputeDevice.gpu : ComputeDevice.cpu;
    if (m.esLiteRt) {
      return LiteRtLmModelParams(contextSize: 2048, device: device, numberOfThreads: hilos);
    }
    return LlamaCppModelParams(
      contextSize: 2048,
      device: device,
      preferredBackend: gpu ? GpuBackend.vulkan : GpuBackend.cpu,
      gpuLayers: gpu ? ModelParams.maxGpuLayers : 0,
      numberOfThreads: hilos,
      numberOfThreadsBatch: hilos,
    );
  }

  /// Carga el modelo. Si se pidió GPU y falla, lo intenta en CPU y lo deja anotado en [error].
  Future<void> cargar(ModeloInfo m, String ruta, {required bool gpu, required int hilos}) async {
    if (cargando) throw StateError('Ya hay una carga en curso');
    cargando = true;
    error = null;
    notifyListeners();
    await _cola; // que no haya una generación en curso
    final sw = Stopwatch()..start();
    try {
      await _soltar();
      this.hilos = hilos;
      backendPedido = gpu ? 'gpu' : 'cpu';
      final engine = LlamaEngine(LlamaBackend());
      try {
        await engine.setModel(LlamaModel(ModelSource.path(ruta)), params: _params(m, gpu, hilos));
        // LiteRT-LM arranca el delegado de GPU en el primer uso: se calienta aquí para que la carga lo cuente.
        await engine.tokenize('Hola');
      } catch (e) {
        if (!gpu) {
          await engine.dispose();
          rethrow;
        }
        error = 'GPU no disponible ($e). Cargado en CPU.';
        await engine.setModel(LlamaModel(ModelSource.path(ruta)), params: _params(m, false, hilos));
        await engine.tokenize('Hola');
      }
      _engine = engine;
      modelo = m;
      rutaModelo = ruta;
      backendReal = await engine.getBackendName();
      cargaMs = sw.elapsedMilliseconds;
      rssTrasCargaMB = rssMB();
    } catch (e) {
      error = 'No cargó: $e';
      modelo = null;
      rethrow;
    } finally {
      cargando = false;
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

  /// Genera en cola. Corta por tiempo (timeoutMs) o por límite de tokens; nunca lanza: los errores van en [Generacion.error].
  Future<Generacion> generar(
    List<LlamaChatMessage> mensajes, {
    required String id,
    int maxTokens = 60,
    int timeoutMs = 4000,
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
        params: GenerationParams(maxTokens: maxTokens, temp: 0, topK: 1, topP: 1, penalty: 1.0, seed: 42),
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
    if (_idActual == id) {
      _cancelados.add(id);
      _engine?.cancelGeneration();
    } else {
      _cancelados.add(id);
    }
  }

  void detenerTodo() {
    if (_idActual != null) _cancelados.add(_idActual!);
    _engine?.cancelGeneration();
  }
}
