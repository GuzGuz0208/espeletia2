// Ajustes ocultos (mantener pulsada la barra de estado): modelo de la IA local, descarga, importar un GGUF (USB o adb),
// hilos y una prueba de velocidad con 3 preguntas reales y 1 trampa (tiempos, tokens/s, RAM y batería en JSON).
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:battery_plus/battery_plus.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_web.dart';
import 'critico.dart';
import 'instalador.dart';
import 'modelos.dart';
import 'motor.dart';
import 'puente.dart';
import 'verificador.dart';

class PantallaAjustes extends StatefulWidget {
  const PantallaAjustes({super.key, required this.web});
  final ControladorWeb web;
  @override
  State<PantallaAjustes> createState() => _PantallaAjustesState();
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

class _PantallaAjustesState extends State<PantallaAjustes> {
  final ins = Instalador.i;
  final motor = Motor.i;
  Prompts? prompts;
  Map<String, dynamic> telefono = {};
  List<_Fila> filas = [];
  bool corriendo = false, detenido = false;
  Map<String, dynamic>? bateria;
  String aviso = '', json = '';

  @override
  void initState() {
    super.initState();
    ins.addListener(_refrescar);
    motor.addListener(_refrescar);
    _iniciar();
  }

  @override
  void dispose() {
    ins.removeListener(_refrescar);
    motor.removeListener(_refrescar);
    super.dispose();
  }

  void _refrescar() {
    if (mounted) setState(() {});
  }

  Future<void> _iniciar() async {
    prompts = await Prompts.leer();
    try {
      final a = await DeviceInfoPlugin().androidInfo;
      telefono = {
        'fabricante': a.manufacturer,
        'modelo': a.model,
        'android': a.version.release,
        'sdk': a.version.sdkInt,
        'hardware': a.hardware,
        'ramTotalMB': a.physicalRamSize,
        'ramLibreMB': a.availableRamSize,
        'nucleos': Platform.numberOfProcessors,
        'nucleosGrandes': nucleosGrandes(),
      };
    } catch (e) {
      telefono = {'error': '$e', 'nucleos': Platform.numberOfProcessors};
    }
    _refrescar();
  }

  Future<void> _importarArchivo() async {
    final r = await FilePicker.pickFiles(type: FileType.any);
    if (r.isEmpty) return;
    final f = r.first;
    final largo = await f.xFile.length();
    await ins.importarArchivo(largo, () => f.xFile.openRead());
    try {
      await FilePicker.clearTemporaryFiles();
    } catch (_) {}
  }

  Future<void> _correr() async {
    final p = prompts;
    if (!motor.listo || p == null) return;
    final pruebas = (p.j['pruebas'] as List).cast<Map<String, dynamic>>();
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
    final cfg = ins.params;
    for (final (i, f) in filas.indexed) {
      if (detenido) break;
      final pregunta = f.prueba['pregunta'] as String, dato = f.prueba['dato'] as String;
      final motivo = motivoRechazo(f.prueba['ficha'] as String);
      if (motivo != null) {
        f.rechazo = motivo; // nunca se manda al modelo
        continue;
      }
      setState(() => aviso = 'Pregunta ${i + 1} de ${filas.length}…');
      f.g = await motor.generar(
        p.mensajes('es', pregunta, dato),
        id: 'lab-$i',
        maxTokens: cfg?.maxTokens ?? 70,
        timeoutMs: 30000, // en la prueba se mide sin cortar; la PWA usa timeoutMs de modelo.json
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
    aviso = '${detenido ? 'Detenido. ' : ''}${filas.where((f) => f.pasa).length} de ${filas.length} pasan · '
        'mediana primera palabra ${_mediana((f) => (f.g?.primeraPalabraMs ?? -1) < 0 ? null : f.g!.primeraPalabraMs.toDouble())} ms · '
        'mediana ${_mediana((f) => f.g?.tokensPorSegundo)} tok/s';
    json = const JsonEncoder.withIndent(' ').convert(_resultados());
    _refrescar();
  }

  num? _mediana(double? Function(_Fila) k) {
    final v = filas.map(k).whereType<double>().toList()..sort();
    if (v.isEmpty) return null;
    final x = v[v.length ~/ 2];
    return double.parse(x.toStringAsFixed(1));
  }

  Map<String, dynamic> _resultados() {
    final m = motor.modelo;
    return {
      'fecha': DateTime.now().toIso8601String(),
      'app': 'Fray · Guía de páramo (Flutter + llamadart 0.21.0, llama.cpp CPU)',
      'telefono': telefono,
      'modelo': m == null ? null : {'id': m.id, 'archivo': m.archivo, 'sha256': m.sha256, 'licencia': m.licencia},
      'backendReal': motor.backendReal,
      'cargaMs': motor.cargaMs,
      'calentarPromptMs': motor.calentarMs,
      'hilos': motor.hilos,
      'nCtx': motor.nCtx,
      'ramProcesoTrasCargaMB': motor.rssTrasCargaMB,
      'ramProcesoMaxMB': Motor.rssMaxMB(),
      'bateria': bateria,
      'pruebas': [
        for (final f in filas)
          {
            'pregunta': f.prueba['pregunta'],
            'trampa': f.trampa,
            if (f.rechazo != null) 'rechazado': f.rechazo,
            'respuesta': f.g?.texto,
            'verificador': f.v == null ? null : (f.v!.ok ? 'pasa' : 'bloquea'),
            'fallas': f.v?.fallas,
            'pasa': f.pasa,
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

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cat = ins.catalogo;
    return Scaffold(
      appBar: AppBar(title: const Text('Ajustes de la IA local')),
      body: cat == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(12), children: [
              Text(ins.textoBarra, style: t.bodyMedium),
              if (ins.progreso != null && ins.estado == EstadoIA.descargando) LinearProgressIndicator(value: ins.progreso),
              if (ins.error != null) Text(ins.error!, style: t.bodySmall?.copyWith(color: Colors.red)),
              Text(
                  '${telefono['fabricante'] ?? ''} ${telefono['modelo'] ?? ''} · Android ${telefono['android'] ?? '?'} · '
                  'RAM ${telefono['ramTotalMB'] ?? '?'} MB · ${telefono['nucleos'] ?? '?'} núcleos (${telefono['nucleosGrandes'] ?? '?'} grandes)',
                  style: t.bodySmall),
              if (cat.origen != 'app') Text('modelo.json reemplazado: ${cat.origen}', style: t.bodySmall),
              const SizedBox(height: 8),
              Text('Modelo', style: t.titleMedium),
              for (final m in cat.modelos)
                RadioListTile<String>(
                  value: m.id,
                  // ignore: deprecated_member_use
                  groupValue: ins.modelo?.id,
                  // ignore: deprecated_member_use
                  onChanged: corriendo ? null : (v) => ins.elegirModelo(v!),
                  title: Text(m.nombre),
                  subtitle: Text('${m.tamano} · ${m.licencia}${m.id == cat.porDefecto ? ' · por defecto' : ''}\n${m.nota}'),
                  isThreeLine: true,
                ),
              Wrap(spacing: 8, runSpacing: 8, children: [
                if (ins.estado == EstadoIA.descargando)
                  OutlinedButton(onPressed: ins.pausar, child: const Text('Pausar descarga')),
                if (ins.estado == EstadoIA.pausada || ins.estado == EstadoIA.esperandoRed || ins.estado == EstadoIA.error)
                  FilledButton(onPressed: ins.reintentarYa, child: const Text('Descargar / reintentar ahora')),
                OutlinedButton(onPressed: corriendo ? null : _importarArchivo, child: const Text('Importar GGUF desde archivo')),
                OutlinedButton(onPressed: corriendo ? null : ins.borrarModelo, child: const Text('Borrar modelo')),
                OutlinedButton(onPressed: () => widget.web.recargar(), child: const Text('Recargar la página')),
              ]),
              const SizedBox(height: 4),
              Text(
                  'Sin señal: adb push ${ins.modelo?.archivo ?? '<archivo>.gguf'} ${Almacen.i.carpetaImportar}/ '
                  'y vuelve a abrir la app (se verifica y se usa ahí mismo).',
                  style: t.bodySmall),
              const Divider(),
              Row(children: [
                const Text('Hilos: '),
                DropdownButton<int?>(
                  value: ins.hilosElegidos,
                  items: [
                    DropdownMenuItem(value: null, child: Text('automático (${ins.params?.hilos ?? nucleosGrandes()})')),
                    for (final h in [1, 2, 3, 4, 6, 8]) DropdownMenuItem(value: h, child: Text('$h')),
                  ],
                  onChanged: corriendo ? null : (v) => ins.elegirHilos(v),
                ),
              ]),
              if (motor.listo)
                Text(
                    'Cargado: ${motor.modelo!.nombre} · ${motor.backendReal} · ${motor.hilos} hilos · n_ctx ${motor.nCtx} · '
                    'carga ${motor.cargaMs} ms · prompt del sistema ${motor.calentarMs ?? '-'} ms · RAM ${motor.rssTrasCargaMB} MB',
                    style: t.bodySmall),
              const Divider(),
              Text('Prueba de velocidad (3 preguntas + 1 trampa)', style: t.titleMedium),
              Wrap(spacing: 8, children: [
                FilledButton(onPressed: motor.listo && !corriendo ? _correr : null, child: const Text('Correr')),
                OutlinedButton(
                    onPressed: corriendo
                        ? () {
                            detenido = true;
                            motor.detenerTodo();
                          }
                        : null,
                    child: const Text('Detener')),
              ]),
              Text(aviso, style: t.bodyMedium),
              for (final (i, f) in filas.indexed) _fila(i, f),
              if (json.isNotEmpty) ...[
                FilledButton.icon(
                  icon: const Icon(Icons.copy),
                  label: const Text('Copiar resultados (JSON)'),
                  onPressed: () async {
                    final msj = ScaffoldMessenger.of(context);
                    await Clipboard.setData(ClipboardData(text: json));
                    msj.showSnackBar(const SnackBar(content: Text('Copiado')));
                  },
                ),
                SelectableText(json, style: const TextStyle(fontFamily: 'monospace', fontSize: 11)),
              ],
              const SizedBox(height: 16),
              Text('Licencias: llamadart (MIT), llama.cpp (MIT), Qwen (Apache-2.0).', style: t.bodySmall),
              const SizedBox(height: 40),
            ]),
    );
  }

  Widget _fila(int i, _Fila f) {
    final g = f.g, v = f.v;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${i + 1}. ${f.prueba['pregunta']}${f.trampa ? ' (trampa)' : ''}', style: const TextStyle(fontWeight: FontWeight.w600)),
          if (f.rechazo != null) Text('No se manda al modelo: ${f.rechazo}', style: const TextStyle(color: Colors.red)),
          if (g == null && f.rechazo == null) Text(f.vivo.isEmpty ? '…' : f.vivo),
          if (g != null) ...[
            Text('«${g.texto.isEmpty ? '—' : g.texto}»'),
            if (v != null)
              Text(v.ok ? 'Verificador: pasa' : 'Verificador: bloquea (${v.fallas.join(' · ')})',
                  style: TextStyle(color: v.ok ? Colors.green.shade800 : Colors.red, fontSize: 12)),
            Text(
                'Primera palabra ${g.primeraPalabraMs} ms · total ${g.totalMs} ms · ${g.tokens} tokens · '
                '${g.tokensPorSegundo.toStringAsFixed(1)} tok/s${g.cortado ? ' · CORTADO' : ''}',
                style: const TextStyle(fontSize: 11)),
          ],
        ]),
      ),
    );
  }
}
