// Puente window.FrayNativo (versión 1) entre la PWA y el motor nativo. Contrato en nativo/README.md; el adaptador de la
// PWA está en js/generador.js (nativo()).
//
// Flujo: la PWA ya mostró la frase del guion; pide generar() con la ficha y el contexto; aquí se rechaza el carril crítico
// sin llamar al modelo, se genera con tiempo máximo y se pasa el verificador nativo. La PWA vuelve a verificar con
// js/verificador.js y, si algo falla, se queda con la frase del guion.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;
import 'package:llamadart/llamadart.dart';

import 'critico.dart';
import 'instalador.dart';
import 'motor.dart';
import 'verificador.dart';

/// Script que se inyecta en la página (solo en el origen de la app). FrayNativoCanal lo pone el WebView.
const scriptPuente = r'''
(() => {
  if (window.FrayNativo || !window.FrayNativoCanal) return;
  const pendientes = new Map();
  let n = 0;
  const llamar = (op, args) => new Promise((ok) => {
    const k = 'k' + (++n);
    pendientes.set(k, ok);
    window.FrayNativoCanal.postMessage(JSON.stringify({ k, op, args }));
  });
  Object.defineProperty(window, '__frayNativoResp', { value: (k, res) => {
    const ok = pendientes.get(k);
    if (ok) { pendientes.delete(k); ok(res); }
  } });
  Object.defineProperty(window, '__frayNativoTrozo', { value: (id, trozo) => {
    window.dispatchEvent(new CustomEvent('fray-nativo', { detail: { id, trozo } }));
  } });
  Object.defineProperty(window, '__frayNativoEstado', { value: (e) => {
    window.dispatchEvent(new CustomEvent('fray-nativo-estado', { detail: e }));
  } });
  window.FrayNativo = Object.freeze({
    version: 1,
    estado: () => llamar('estado', {}),
    generar: (p) => llamar('generar', p || {}),
    cancelar: (id) => { window.FrayNativoCanal.postMessage(JSON.stringify({ op: 'cancelar', args: { id: String(id) } })); },
  });
})();
''';

class Prompts {
  Prompts(this.j);
  final Map<String, dynamic> j;

  static Future<Prompts> leer() async =>
      Prompts(jsonDecode(await rootBundle.loadString('assets/laboratorio.json')) as Map<String, dynamic>);

  String sistema(String idioma) => (j['sistema'] as Map)[idioma] as String;
  String usuario(String idioma, String pregunta, String dato) =>
      ((j['usuario'] as Map)[idioma] as String).replaceAll('{pregunta}', pregunta).replaceAll('{dato}', dato);

  /// Igual que mensajes() de js/generador.js: sistema fijo + «PREGUNTA: «…»\nTEXTO DEL GUION: …».
  List<LlamaChatMessage> mensajes(String idioma, String pregunta, String dato) {
    final p = pregunta.replaceAll(RegExp(r'[\r\n«»"]+'), ' ').trim();
    return [
      LlamaChatMessage.fromText(role: LlamaChatRole.system, text: sistema(idioma)),
      LlamaChatMessage.fromText(role: LlamaChatRole.user, text: usuario(idioma, p.length > 200 ? p.substring(0, 200) : p, dato)),
    ];
  }
}

class PuenteFray {
  PuenteFray({required this.ejecutarJs, required this.prompts});

  /// Corre JavaScript en la página.
  final Future<void> Function(String js) ejecutarJs;
  final Prompts prompts;

  /// Mensaje que llega por FrayNativoCanal (el WebView ya comprobó el origen).
  Future<void> recibir(String crudo) async {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(crudo) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    final op = msg['op'], k = msg['k'], args = (msg['args'] as Map?)?.cast<String, dynamic>() ?? {};
    if (op == 'cancelar') {
      final id = args['id'];
      if (id is String) Motor.i.cancelar(id);
      return;
    }
    if (k is! String) return;
    Object res;
    if (op == 'estado') {
      res = estado();
    } else if (op == 'generar') {
      res = await generar(args);
    } else {
      res = {'error': 'operación desconocida'};
    }
    await ejecutarJs('window.__frayNativoResp(${jsonEncode(k)}, ${jsonEncode(res)});');
  }

  /// `listo` es true si el modelo está instalado y cargado o cargándose (generar espera la carga dentro de su
  /// timeoutMs). Así la PWA, que pregunta una sola vez al arrancar, no se queda sin IA por llegar antes que la precarga.
  Map<String, dynamic> estado() {
    final m = Motor.i, ins = Instalador.i;
    return {
      'listo': m.listo || (m.cargando && ins.instalado),
      'cargando': m.cargando,
      'modelo': m.modelo?.id ?? ins.modelo?.id ?? '',
      'motor': 'llama.cpp',
      'backend': 'cpu',
      if (m.cargaMs != null) 'cargaMs': m.cargaMs,
      'instalacion': ins.resumen(),
    };
  }

  Future<Map<String, dynamic>> generar(Map<String, dynamic> p) async {
    final id = p['id'] is String ? p['id'] as String : '';
    final pregunta = p['pregunta'] is String ? p['pregunta'] as String : '';
    final idioma = p['idioma'] == 'en' ? 'en' : 'es';
    final fichaId = p['fichaId'] is String ? p['fichaId'] as String : '';
    final contexto = p['contexto'] is String ? p['contexto'] as String : '';
    final tipo = p['tipo'] is String ? p['tipo'] as String : null;
    final cfg = Instalador.i.params;
    final maxTokens = ((p['maxTokens'] as num?) ?? cfg?.maxTokens ?? 70).toInt().clamp(1, 200);
    final timeoutMs = ((p['timeoutMs'] as num?) ?? cfg?.timeoutMs ?? 6000).toInt().clamp(200, 30000);

    Map<String, dynamic> respuesta({String texto = '', bool ok = false, List<String> fallas = const [], int primera = -1,
            int total = 0, int tokens = 0, bool cortado = false, bool critica = false}) =>
        {
          'id': id,
          'texto': texto,
          'ok': ok,
          'fallas': fallas,
          'primeraPalabraMs': primera,
          'totalMs': total,
          'tokens': tokens,
          'cortado': cortado,
          if (critica) 'rechazado': 'critica',
        };

    // 1. Carril crítico: nunca llega al modelo.
    final motivo = motivoRechazo(fichaId, tipo: tipo);
    if (motivo != null) return respuesta(fallas: [motivo], critica: true);
    if (pregunta.trim().isEmpty || contexto.trim().isEmpty || pregunta.length > 500 || contexto.length > 4000) {
      return respuesta(fallas: ['pregunta o contexto vacío o demasiado largo']);
    }
    // 2. Si el modelo se está precargando, se espera dentro del mismo tiempo máximo.
    final sw = Stopwatch()..start();
    if (!Motor.i.listo && !await Motor.i.esperarListo(Duration(milliseconds: timeoutMs - 300))) {
      return respuesta(fallas: [Instalador.i.instalado ? 'el modelo todavía se está cargando' : 'modelo no instalado']);
    }
    final resto = timeoutMs - sw.elapsedMilliseconds;
    if (resto < 300) return respuesta(fallas: ['sin tiempo tras cargar el modelo'], cortado: true);

    // 3. Generar con tiempo máximo, mandando cada trozo a la página.
    final g = await Motor.i.generar(
      prompts.mensajes(idioma, pregunta, contexto),
      id: id,
      maxTokens: maxTokens,
      timeoutMs: resto,
      alTrozo: (t) => ejecutarJs('window.__frayNativoTrozo(${jsonEncode(id)}, ${jsonEncode(t)});'),
    );

    // 4. Verificador nativo (la PWA verifica otra vez con js/verificador.js).
    final v = verificar(g.texto, contexto, pregunta, idioma: idioma);
    final fallas = [
      ...v.fallas,
      if (v.dijoNoSe) 'se abstuvo: se queda la frase del guion',
      if (g.error != null) 'error: ${g.error}',
      if (g.cortado) 'cortado por tiempo o por límite de tokens',
    ];
    return respuesta(
      texto: g.texto,
      ok: fallas.isEmpty,
      fallas: fallas,
      primera: g.primeraPalabraMs,
      total: sw.elapsedMilliseconds,
      tokens: g.tokens,
      cortado: g.cortado,
    );
  }
}
