// Pantalla «Laboratorio»: descarga o importa un modelo, lo carga en CPU o GPU y corre las 5 preguntas de
// laboratorio/prueba-llm-nativo.md con su prompt del sistema. Mide carga, primera palabra, total, tokens, tokens/s,
// RAM y batería, pasa cada respuesta por el verificador y deja todo en JSON para copiar.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:battery_plus/battery_plus.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'critico.dart';
import 'modelos.dart';
import 'motor.dart';
import 'puente.dart';
import 'verificador.dart';

class PantallaLaboratorio extends StatefulWidget {
  const PantallaLaboratorio({super.key});
  @override
  State<PantallaLaboratorio> createState() => _PantallaLaboratorioState();
}

class _Fila {
  _Fila(this.prueba);
  final Map<String, dynamic> prueba;
  String vivo = '';
  Generacion? g;
  Veredicto? v;
  String? rechazo;
  bool get trampa => prueba['trampa'] == true;
  bool get pasa {
    final g = this.g, v = this.v;
    if (g == null || v == null || g.cortado) return false;
    return trampa ? v.dijoNoSe : (v.ok && !v.dijoNoSe);
  }
}

class _PantallaLaboratorioState extends State<PantallaLaboratorio> with AutomaticKeepAliveClientMixin {
  final motor = Motor.i;
  List<ModeloInfo> catalogo = [];
  final Map<String, String> estadoModelo = {};
  final Map<String, double?> progreso = {};
  final Map<String, CancelarDescarga> descargas = {};
  String? elegido;
  bool gpu = false;
  int hilos = 4, maxTokens = 60, timeoutS = 15;
  bool conEjemplos = true;
  bool corriendo = false, detenido = false;
  String aviso = '';
  List<_Fila> filas = [];
  Map<String, dynamic> telefono = {};
  Map<String, dynamic>? bateria;
  Prompts? prompts;
  CatalogoFichas? fichas;
  String json = '';

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    motor.addListener(_refrescar);
    _iniciar();
  }

  @override
  void dispose() {
    motor.removeListener(_refrescar);
    super.dispose();
  }

  void _refrescar() {
    if (mounted) setState(() {});
  }

  Future<void> _iniciar() async {
    await Almacen.i.iniciar();
    catalogo = await leerCatalogo();
    prompts = await Prompts.leer();
    try {
      fichas = CatalogoFichas.desdeJson(jsonDecode(await rootBundle.loadString('assets/pwa/chat.json')) as Map<String, dynamic>);
    } catch (_) {
      fichas = null; // sin PWA copiada: solo se aplican las fichas críticas fijas
    }
    telefono = await _infoTelefono();
    elegido = catalogo.first.id;
    for (final m in catalogo) {
      await _revisar(m);
    }
    _refrescar();
  }

  Future<Map<String, dynamic>> _infoTelefono() async {
    try {
      final a = await DeviceInfoPlugin().androidInfo;
      return {
        'fabricante': a.manufacturer,
        'modelo': a.model,
        'marca': a.brand,
        'dispositivo': a.device,
        'hardware': a.hardware,
        'placa': a.board,
        'android': a.version.release,
        'sdk': a.version.sdkInt,
        'abis': a.supportedAbis,
        'ramTotalMB': a.physicalRamSize,
        'ramLibreMB': a.availableRamSize,
        'nucleos': Platform.numberOfProcessors,
      };
    } catch (e) {
      return {'error': '$e', 'nucleos': Platform.numberOfProcessors};
    }
  }

  Future<void> _revisar(ModeloInfo m) async {
    final ruta = await Almacen.i.rutaVerificada(m);
    if (ruta != null) {
      estadoModelo[m.id] = 'Listo (verificado)';
    } else if (await Almacen.i.hayImportable(m)) {
      estadoModelo[m.id] = 'Copiado con adb: pulsa Importar para verificarlo';
    } else {
      estadoModelo[m.id] = 'No está en el teléfono';
    }
  }

  ModeloInfo get _modelo => catalogo.firstWhere((m) => m.id == elegido);

  Future<void> _descargar(ModeloInfo m) async {
    final c = CancelarDescarga();
    descargas[m.id] = c;
    setState(() {
      progreso[m.id] = 0;
      estadoModelo[m.id] = 'Descargando…';
    });
    try {
      await Almacen.i.descargar(m, (h, t) {
        progreso[m.id] = h / t;
        estadoModelo[m.id] = 'Descargando ${(h / 1e6).toStringAsFixed(0)} de ${(t / 1e6).toStringAsFixed(0)} MB';
        _refrescar();
      }, (s) {
        estadoModelo[m.id] = s;
        _refrescar();
      }, c);
      estadoModelo[m.id] = 'Listo (verificado)';
    } catch (e) {
      estadoModelo[m.id] = 'Falló: $e';
    }
    descargas.remove(m.id);
    progreso.remove(m.id);
    _refrescar();
  }

  Future<void> _importar(ModeloInfo m) async {
    setState(() => estadoModelo[m.id] = 'Revisando…');
    try {
      await Almacen.i.importar(m, (s) {
        estadoModelo[m.id] = s;
        _refrescar();
      });
      estadoModelo[m.id] = 'Listo (importado y verificado)';
    } catch (e) {
      estadoModelo[m.id] = 'No se pudo importar: $e';
    }
    _refrescar();
  }

  Future<void> _borrar(ModeloInfo m) async {
    if (motor.modelo?.id == m.id) await motor.descargarDeMemoria();
    await Almacen.i.borrar(m);
    await _revisar(m);
    _refrescar();
  }

  Future<void> _cargar() async {
    final m = _modelo;
    final ruta = await Almacen.i.rutaVerificada(m);
    if (ruta == null) {
      setState(() => aviso = 'Primero descarga o importa ${m.nombre}.');
      return;
    }
    setState(() => aviso = 'Cargando ${m.nombre}…');
    try {
      await motor.cargar(m, ruta, gpu: gpu, hilos: hilos);
      aviso = 'Listo en ${motor.cargaMs} ms · backend real: ${motor.backendReal}';
    } catch (e) {
      aviso = 'No cargó: $e';
    }
    _refrescar();
  }

  Future<void> _correr() async {
    final p = prompts;
    if (!motor.listo || p == null) return;
    final pruebas = ((p.j['pruebas']) as List).cast<Map<String, dynamic>>();
    setState(() {
      corriendo = true;
      detenido = false;
      filas = [for (final t in pruebas) _Fila(t)];
      json = '';
    });
    final bat = Battery();
    int? antes;
    try {
      antes = await bat.batteryLevel;
    } catch (_) {}
    for (final (i, f) in filas.indexed) {
      if (detenido) break;
      final ficha = f.prueba['ficha'] as String;
      final motivo = motivoRechazo(ficha, fichas);
      if (motivo != null) {
        f.rechazo = motivo; // nunca se manda al modelo una ficha crítica
        continue;
      }
      setState(() => aviso = 'Pregunta ${i + 1} de ${filas.length}…');
      final pregunta = f.prueba['pregunta'] as String, dato = f.prueba['dato'] as String;
      f.g = await motor.generar(
        p.mensajes('es', pregunta, dato, conEjemplos: conEjemplos),
        id: 'lab-$i',
        maxTokens: maxTokens,
        timeoutMs: timeoutS * 1000,
        alTrozo: (t) {
          f.vivo += t;
          _refrescar();
        },
      );
      f.v = verificar(f.g!.texto, dato, pregunta);
      _refrescar();
    }
    int? despues;
    String? estadoBat;
    try {
      despues = await bat.batteryLevel;
      estadoBat = (await bat.batteryState).name;
    } catch (_) {}
    bateria = {'antes': antes, 'despues': despues, 'estado': estadoBat};
    corriendo = false;
    final pasan = filas.where((f) => f.pasa).length;
    aviso = '${detenido ? 'Detenido. ' : ''}$pasan de ${filas.length} pasan · mediana total ${_mediana((f) => f.g?.totalMs.toDouble())} ms';
    json = const JsonEncoder.withIndent(' ').convert(_resultados());
    _refrescar();
  }

  num? _mediana(double? Function(_Fila) k) {
    final v = filas.map(k).whereType<double>().toList()..sort();
    if (v.isEmpty) return null;
    final x = v[v.length ~/ 2];
    return x == x.roundToDouble() ? x.round() : double.parse(x.toStringAsFixed(1));
  }

  Map<String, dynamic> _resultados() {
    final m = motor.modelo;
    return {
      'fecha': DateTime.now().toIso8601String(),
      'app': 'Álbum del Páramo · laboratorio nativo (Flutter + llamadart 0.21.0)',
      'telefono': telefono,
      'modelo': m == null ? null : {'id': m.id, 'archivo': m.archivo, 'motor': motor.nombreMotor, 'sha256': m.sha256, 'licencia': m.licencia},
      'backendPedido': motor.backendPedido,
      'backendReal': motor.backendReal,
      'avisoCarga': motor.error,
      'cargaMs': motor.cargaMs,
      'hilos': motor.hilos,
      'maxTokens': maxTokens,
      'timeoutMs': timeoutS * 1000,
      'conEjemplos': conEjemplos,
      'sinRazonar': m?.sinRazonar,
      'ramProcesoTrasCargaMB': motor.rssTrasCargaMB,
      'ramProcesoMaxMB': Motor.rssMaxMB(),
      'bateria': bateria,
      'resumen': {
        'pasan': '${filas.where((f) => f.pasa).length}/${filas.length}',
        'medianaPrimeraPalabraMs': _mediana((f) => (f.g?.primeraPalabraMs ?? -1) < 0 ? null : f.g!.primeraPalabraMs.toDouble()),
        'medianaTotalMs': _mediana((f) => f.g?.totalMs.toDouble()),
        'medianaTokensPorSegundo': _mediana((f) => f.g?.tokensPorSegundo),
      },
      'pruebas': [
        for (final f in filas)
          {
            'ficha': f.prueba['ficha'],
            'pregunta': f.prueba['pregunta'],
            'trampa': f.trampa,
            if (f.rechazo != null) 'rechazado': f.rechazo,
            'respuesta': f.g?.texto,
            'verificador': f.v == null ? null : (f.v!.ok ? 'pasa' : 'bloquea'),
            'fallas': f.v?.fallas,
            'dijoNoSe': f.v?.dijoNoSe,
            'pasa': f.pasa,
            'utilSegunPersona': null,
            'primeraPalabraMs': f.g?.primeraPalabraMs,
            'totalMs': f.g?.totalMs,
            'tokens': f.g?.tokens,
            'tokensPorSegundo': f.g == null ? null : double.parse(f.g!.tokensPorSegundo.toStringAsFixed(1)),
            'cortado': f.g?.cortado,
            if (f.g?.error != null) 'error': f.g!.error,
          },
      ],
    };
  }

  void _detener() {
    detenido = true;
    motor.detenerTodo();
    _refrescar();
  }

  // ---------- Interfaz ----------
  @override
  Widget build(BuildContext context) {
    super.build(context);
    final t = Theme.of(context).textTheme;
    if (catalogo.isEmpty) return const Center(child: CircularProgressIndicator());
    return ListView(padding: const EdgeInsets.all(12), children: [
      Text('Laboratorio de LLM nativo', style: t.titleLarge),
      Text(
          '${telefono['fabricante'] ?? ''} ${telefono['modelo'] ?? ''} · Android ${telefono['android'] ?? '?'} · '
          'RAM ${telefono['ramTotalMB'] ?? '?'} MB · ${telefono['nucleos'] ?? '?'} núcleos',
          style: t.bodySmall),
      const SizedBox(height: 4),
      Text('El teléfono puede calentarse mientras genera. Si notas lentitud, pulsa Detener.',
          style: t.bodySmall?.copyWith(color: Colors.orange.shade800)),
      const SizedBox(height: 8),
      Text('Modelos', style: t.titleMedium),
      for (final m in catalogo) _tarjetaModelo(m),
      Text('Para importar: adb push <archivo> ${Almacen.i.carpetaImportar}/', style: t.bodySmall),
      const Divider(),
      _controles(),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 8, children: [
        FilledButton(onPressed: corriendo || motor.cargando ? null : _cargar, child: const Text('1. Cargar')),
        FilledButton(onPressed: motor.listo && !corriendo ? _correr : null, child: const Text('2. Correr las 5 preguntas')),
        FilledButton.tonal(
            onPressed: corriendo ? _detener : null,
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade100),
            child: const Text('Detener')),
        if (motor.listo && !corriendo)
          OutlinedButton(onPressed: () => motor.descargarDeMemoria(), child: const Text('Sacar de memoria')),
      ]),
      const SizedBox(height: 8),
      if (motor.cargando) const LinearProgressIndicator(),
      Text(aviso, style: t.bodyMedium),
      if (motor.listo)
        Text(
            'Cargado: ${motor.modelo!.nombre} · ${motor.nombreMotor} · pedido ${motor.backendPedido}, real «${motor.backendReal}» · '
            'carga ${motor.cargaMs} ms · RAM del proceso ${motor.rssTrasCargaMB} MB',
            style: t.bodySmall),
      if (motor.error != null) Text(motor.error!, style: t.bodySmall?.copyWith(color: Colors.red)),
      for (final (i, f) in filas.indexed) _filaResultado(i, f),
      if (json.isNotEmpty) ...[
        const Divider(),
        Row(children: [
          Expanded(child: Text('Resultados (JSON) · pégalos en el issue #24', style: t.titleSmall)),
          FilledButton.icon(
            icon: const Icon(Icons.copy),
            label: const Text('Copiar resultados (JSON)'),
            onPressed: () async {
              final mensajero = ScaffoldMessenger.of(context);
              await Clipboard.setData(ClipboardData(text: json));
              mensajero.showSnackBar(const SnackBar(content: Text('Copiado')));
            },
          ),
        ]),
        Container(
          padding: const EdgeInsets.all(8),
          color: Colors.black12,
          child: SelectableText(json, style: const TextStyle(fontFamily: 'monospace', fontSize: 11)),
        ),
      ],
      const SizedBox(height: 40),
    ]);
  }

  Widget _tarjetaModelo(ModeloInfo m) {
    final estado = estadoModelo[m.id] ?? '…';
    final bajando = descargas.containsKey(m.id);
    final listo = estado.startsWith('Listo');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          InkWell(
            onTap: corriendo ? null : () => setState(() => elegido = m.id),
            child: Row(children: [
              Icon(elegido == m.id ? Icons.radio_button_checked : Icons.radio_button_unchecked, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text(m.nombre, style: const TextStyle(fontWeight: FontWeight.w600))),
            ]),
          ),
          Text('${m.tamano} · ${m.motor} · ${m.licencia}${m.sinRazonar ? ' · sin razonamiento' : ''}',
              style: const TextStyle(fontSize: 12)),
          Text(estado, style: TextStyle(fontSize: 12, color: listo ? Colors.green.shade800 : null)),
          if (progreso[m.id] != null) LinearProgressIndicator(value: progreso[m.id]),
          Wrap(spacing: 6, children: [
            if (!listo && !bajando) TextButton(onPressed: () => _descargar(m), child: const Text('Descargar (wifi)')),
            if (bajando) TextButton(onPressed: () => descargas[m.id]?.cancelar(), child: const Text('Cancelar')),
            if (!listo && !bajando) TextButton(onPressed: () => _importar(m), child: const Text('Importar (adb)')),
            if (listo) TextButton(onPressed: corriendo ? null : () => _borrar(m), child: const Text('Borrar')),
          ]),
        ]),
      ),
    );
  }

  Widget _controles() {
    Widget numero(String etiqueta, int valor, int min, int max, int paso, void Function(int) cambiar) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(etiqueta),
            IconButton(onPressed: valor - paso >= min ? () => setState(() => cambiar(valor - paso)) : null, icon: const Icon(Icons.remove)),
            Text('$valor'),
            IconButton(onPressed: valor + paso <= max ? () => setState(() => cambiar(valor + paso)) : null, icon: const Icon(Icons.add)),
          ],
        );
    return Wrap(spacing: 12, crossAxisAlignment: WrapCrossAlignment.center, children: [
      SegmentedButton<bool>(
        segments: const [ButtonSegment(value: false, label: Text('CPU')), ButtonSegment(value: true, label: Text('GPU'))],
        selected: {gpu},
        onSelectionChanged: corriendo ? null : (s) => setState(() => gpu = s.first),
      ),
      numero('Hilos', hilos, 1, 8, 1, (v) => hilos = v),
      numero('maxTokens', maxTokens, 20, 200, 10, (v) => maxTokens = v),
      numero('Tiempo máx. (s)', timeoutS, 2, 60, 1, (v) => timeoutS = v),
      Row(mainAxisSize: MainAxisSize.min, children: [
        Switch(value: conEjemplos, onChanged: corriendo ? null : (v) => setState(() => conEjemplos = v)),
        const Text('3 ejemplos (few-shot)'),
      ]),
      Text(gpu ? 'GPU: Vulkan en GGUF (experimental), OpenCL/GPU en LiteRT-LM. Hilos y GPU aplican al cargar.' : 'Hilos y GPU aplican al cargar.',
          style: const TextStyle(fontSize: 11)),
    ]);
  }

  Widget _filaResultado(int i, _Fila f) {
    final g = f.g, v = f.v;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${i + 1}. ${f.prueba['pregunta']}${f.trampa ? ' (trampa)' : ''}', style: const TextStyle(fontWeight: FontWeight.w600)),
          Text('DATO: ${f.prueba['dato']}', style: const TextStyle(fontSize: 11)),
          if (f.rechazo != null) Text('No se manda al modelo: ${f.rechazo}', style: const TextStyle(color: Colors.red)),
          if (g == null && f.rechazo == null) Text(f.vivo.isEmpty ? 'Fray: «Dame un momento…»' : 'Fray: «${f.vivo}»'),
          if (g != null) ...[
            Text('Modelo: «${g.texto.isEmpty ? '—' : g.texto}»'),
            if (v != null)
              Text(v.ok ? 'Verificador: pasa' : 'Verificador: bloquea → se muestra el texto oficial',
                  style: TextStyle(color: v.ok ? Colors.green.shade800 : Colors.red, fontWeight: FontWeight.w600)),
            if (v != null && v.fallas.isNotEmpty) Text(v.fallas.join(' · '), style: const TextStyle(fontSize: 11)),
            Text(
                'Primera palabra ${g.primeraPalabraMs} ms · total ${g.totalMs} ms · ${g.tokens} tokens · '
                '${g.tokensPorSegundo.toStringAsFixed(1)} tok/s${g.cortado ? ' · CORTADO' : ''} · pasa: ${f.pasa ? 'sí' : 'no'}',
                style: const TextStyle(fontSize: 11)),
            if (g.error != null) Text('Error: ${g.error}', style: const TextStyle(fontSize: 11, color: Colors.red)),
          ],
        ]),
      ),
    );
  }
}
