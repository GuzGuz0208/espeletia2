// Defensa extra del lado nativo (AGENTS.md). El carril crítico y el verificador corren en la PWA (js/carril.js,
// js/verificador.js) y js/generador.js solo llama a FrayNativo.generar para r.tipo === 'respuesta'. Aquí NO hay catálogo
// propio de fichas (el contenido llega con la PWA y cambia): solo se rechaza, sin llamar al modelo, un fichaId de una
// categoría crítica que la PWA nunca debería enviar (carril de js/carril.js o fichas bloqueadas de alerta y salud), o un
// tipo distinto de 'respuesta' si viene.

/// Ids del carril crítico de js/carril.js y los fijos del contrato v1.
const fichasCriticas = {
  'emergencia', 'salud', 'comer', 'animales', 'volcan', 'condiciones', 'servicios', 'premisa', //
  'mal_altura', 'comer_plantas', 'volcan_estado', 'seguridad', 'abstencion',
};

/// Categorías críticas por nombre de ficha (p. ej. norte-volcan-nivel-alerta, uton-hipoxia-terapias,
/// uton-mam-diagnostico-tratamiento: fichas bloqueadas del paquete).
final _reFichaCritica = RegExp(r'(nivel-alerta|alerta-volcan|emergencia|terapia|tratamiento|diagnostico|toxic|venen|comestible)');

/// Por qué no se puede generar para esta ficha, o null si se puede.
String? motivoRechazo(String fichaId, {String? tipo}) {
  final id = fichaId.trim().toLowerCase();
  if (tipo != null && tipo != 'respuesta') return 'tipo «$tipo»: solo se genera para respuestas';
  if (id.isEmpty) return 'ficha vacía';
  if (fichasCriticas.contains(id) || _reFichaCritica.hasMatch(id)) return 'ficha de una categoría crítica';
  return null;
}
