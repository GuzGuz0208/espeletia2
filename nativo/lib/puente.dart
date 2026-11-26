// Puente window.FrayNativo (versión 1) entre la PWA y el motor nativo. Contrato en nativo/README.md.
//
// Flujo: la PWA ya mostró la frase oficial; pide generar() con la ficha y el contexto; aquí se rechaza el carril crítico
// sin llamar al modelo, se genera con tiempo máximo y el verificador decide. Si ok=false, cortado=true o hay error,
// la PWA se queda con la frase oficial.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;
import 'package:llamadart/llamadart.dart';

import 'critico.dart';
import 'motor.dart';
import 'verificador.dart';

/// Script que se inyecta en index.html. FrayNativoCanal lo pone el WebView (JavaScriptChannel).
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

  List<LlamaChatMessage> mensajes(String idioma, String pregunta, String dato, {bool conEjemplos = true}) {
    final ejemplos = conEjemplos ? ((j['ejemplos'] as Map)[idioma] as List).cast<List>() : const <List>[];
    return [
      LlamaChatMessage.fromText(role: LlamaChatRole.system, text: sistema(idioma)),
      for (final e in ejemplos) ...[
        LlamaChatMessage.fromText(role: LlamaChatRole.user, text: usuario(idioma, e[0] as String, e[1] as String)),
        LlamaChatMessage.fromText(role: LlamaChatRole.assistant, text: e[2] as String),
      ],
      LlamaChatMessage.fromText(role: LlamaChatRole.user, text: usuario(idioma, pregunta, dato)),
    ];
  }
}

class PuenteFray {
  PuenteFray({required this.ejecutarJs});

  /// Corre JavaScript en la página (WebViewController.runJavaScript).
  final Future<void> Function(String js) ejecutarJs;
  CatalogoFichas? _catalogo;
  Prompts? _prompts;
  bool _catalogoFallo = false;

  Future<void> iniciar() async {
    try {
      _catalogo = CatalogoFichas.desdeJson(
          jsonDecode(await rootBundle.loadString('assets/pwa/chat.json')) as Map<String, dynamic>);
    } catch (_) {
      _catalogoFallo = true; // sin catálogo no se genera nada (falla cerrado)
    }
    _prompts = await Prompts.leer();
  }

  /// Mensaje que llega por FrayNativoCanal.
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

  Map<String, dynamic> estado() {
    final m = Motor.i;
    return {
      'listo': m.listo,
      'modelo': m.modelo?.id ?? '',
      'motor': m.nombreMotor,
      'backend': m.enGpu ? 'gpu' : 'cpu',
      if (m.cargaMs != null) 'cargaMs': m.cargaMs,
    };
  }

  Future<Map<String, dynamic>> generar(Map<String, dynamic> p) async {
    final id = p['id'] is String ? p['id'] as String : '';
    final pregunta = p['pregunta'] is String ? p['pregunta'] as String : '';
    final idioma = p['idioma'] == 'en' ? 'en' : 'es';
    final fichaId = p['fichaId'] is String ? p['fichaId'] as String : '';
    final contexto = p['contexto'] is String ? p['contexto'] as String : '';
    final maxTokens = ((p['maxTokens'] as num?) ?? 60).toInt().clamp(1, 200);
    final timeoutMs = ((p['timeoutMs'] as num?) ?? 4000).toInt().clamp(200, 30000);

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
    final motivo = _catalogoFallo ? 'sin catálogo de fichas' : motivoRechazo(fichaId, _catalogo);
    if (motivo != null) return respuesta(fallas: [motivo], critica: true);
    if (pregunta.trim().isEmpty || contexto.trim().isEmpty || pregunta.length > 500 || contexto.length > 4000) {
      return respuesta(fallas: ['pregunta o contexto vacío o demasiado largo']);
    }
    if (!Motor.i.listo || _prompts == null) return respuesta(fallas: ['modelo no cargado']);

    // 2. Generar con tiempo máximo, mandando cada trozo a la página.
    final g = await Motor.i.generar(
      _prompts!.mensajes(idioma, pregunta, contexto),
      id: id,
      maxTokens: maxTokens,
      timeoutMs: timeoutMs,
      alTrozo: (t) => ejecutarJs('window.__frayNativoTrozo(${jsonEncode(id)}, ${jsonEncode(t)});'),
    );

    // 3. Verificador determinista sobre el texto final.
    final v = verificar(g.texto, contexto, pregunta, idioma: idioma);
    final fallas = [...v.fallas, if (v.dijoNoSe) 'se abstuvo: se queda la frase oficial', if (g.error != null) 'error: ${g.error}',
      if (g.cortado) 'cortado por tiempo o por límite de tokens'];
    return respuesta(
      texto: g.texto,
      ok: fallas.isEmpty,
      fallas: fallas,
      primera: g.primeraPalabraMs,
      total: g.totalMs,
      tokens: g.tokens,
      cortado: g.cortado,
    );
  }
}
