// Carril crítico: fichas que NUNCA van al modelo (AGENTS.md, decisión carril-critico-determinista).
// Se rechazan sin llamar al LLM y la PWA deja la frase oficial.

/// Fichas fijas del contrato de window.FrayNativo. Valen aunque no se haya podido leer chat.json.
const fichasCriticas = {'emergencia', 'mal_altura', 'comer_plantas', 'volcan_estado', 'servicios'};

/// Lo mínimo de chat.json que necesita el lado nativo: qué fichas existen y cuáles son urgentes o de abstención.
class CatalogoFichas {
  CatalogoFichas._(this._todas, this._noGenerar);
  final Set<String> _todas;
  final Set<String> _noGenerar;

  factory CatalogoFichas.desdeJson(Map<String, dynamic> chat) {
    final todas = <String>{}, noGenerar = <String>{};
    for (final f in (chat['fichas'] as List? ?? const []).cast<Map<String, dynamic>>()) {
      final id = f['id'] as String?;
      if (id == null) continue;
      todas.add(id);
      if (f['abstencion'] == true || f['urgente'] == true) noGenerar.add(id);
    }
    return CatalogoFichas._(todas, noGenerar);
  }

  bool existe(String id) => _todas.contains(id);
  bool noGenerar(String id) => _noGenerar.contains(id);
}

/// Devuelve por qué no se puede generar para esta ficha, o null si se puede.
/// Con catálogo, además rechaza las fichas urgentes, las de abstención y las que no existen (falla cerrado).
String? motivoRechazo(String fichaId, CatalogoFichas? catalogo) {
  final id = fichaId.trim();
  if (id.isEmpty) return 'ficha vacía';
  if (fichasCriticas.contains(id)) return 'ficha del carril crítico';
  if (catalogo == null) return null;
  if (!catalogo.existe(id)) return 'ficha desconocida';
  if (catalogo.noGenerar(id)) return 'ficha urgente o de abstención';
  return null;
}
