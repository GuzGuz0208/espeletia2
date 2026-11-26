// Verificador determinista («supervisor de cifras»), portado de laboratorio/slm.html (función verificar).
// Pasa solo si todo lo que afirma la respuesta está en el texto fuente. Pasar NO significa ser útil.
// La paridad con la versión JS se prueba en test/verificador_test.dart con test/casos_verificador.json, y
// herramientas/paridad_verificador.mjs corre los mismos casos contra el slm.html del repo.
// Si cambias algo aquí, cambia slm.html y regenera los casos (node herramientas/paridad_verificador.mjs --escribir).

class Veredicto {
  const Veredicto(this.ok, this.fallas, this.dijoNoSe);
  final bool ok;
  final List<String> fallas;
  final bool dijoNoSe;
  Map<String, Object> toJson() => {'ok': ok, 'fallas': fallas, 'dijoNoSe': dijoNoSe};
}

// Equivalente a s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() para el alfabeto latino.
// Dart no trae normalización Unicode: se quitan las tildes con una tabla (Latin-1 y Latin Extended-A) y se
// borran las marcas combinantes que ya vengan separadas.
const _conTilde = 'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝýÿĀāĂăĄąĆćĈĉĊċČčĎďĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİĴĵĶķĹĺĻļĽľŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽž';
const _sinTilde = 'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyyAaAaAaCcCcCcCcDdEeEeEeEeEeGgGgGgGgHhIiIiIiIiIJjKkLlLlLlNnNnNnOoOoOoRrRrRrSsSsSsSsTtTtUuUuUuUuUuUuWwYyYZzZzZz';
final Map<int, int> _mapaTildes = {
  for (var i = 0; i < _conTilde.length; i++) _conTilde.codeUnitAt(i): _sinTilde.codeUnitAt(i),
};

String norm(String s) {
  final out = StringBuffer();
  for (final r in s.runes) {
    if (r >= 0x300 && r <= 0x36f) continue; // marca combinante
    out.writeCharCode(_mapaTildes[r] ?? r);
  }
  return out.toString().toLowerCase();
}

final _reNumero = RegExp(r'\d+(?:[.,:]\d+)*');
final _reSeparador = RegExp(r'[.,:]');

List<String> numeros(String s) => _reNumero.allMatches(s).map((m) => m[0]!.replaceAll(_reSeparador, '')).toList();

final _reFinFrase = RegExp(r'[.!?¿¡]\s*');
final _reEspacios = RegExp(r'\s+');
final _reNoLetra = RegExp(r'[^\p{L}-]', unicode: true);
final _reGuionesBorde = RegExp(r'^-+|-+$');
final _reMayuscula = RegExp(r'^\p{Lu}', unicode: true);

List<String> propios(String s) {
  final out = <String>[];
  for (final frase in s.split(_reFinFrase)) {
    final palabras = frase.trim().split(_reEspacios);
    for (final w in palabras.skip(1)) {
      final x = w.replaceAll(_reNoLetra, '').replaceAll(_reGuionesBorde, '');
      if (x.length > 2 && _reMayuscula.hasMatch(x)) out.add(x);
    }
  }
  return out;
}

// Cifra + unidad: «2026 pesos» no vale si en la fuente 2026 es un año. Solo se comparan unidades de medida o de dinero.
const _medida = {'\$', '%', '°', 'c', 'm', 'km', 'cm', 'ha', 'anos', 'ano', 'am', 'pm', 'metros', 'horas', 'hora', 'min', 'minutos', 'msnm'};
final _reAmPm = RegExp(r'\b([ap])\.\s?m\.');
final _rePesos = RegExp(r'\bpesos\b|\bcop\b');
final _reCifraUnidad = RegExp(r'(\$\s?)?(\d+(?:[.,:]\d+)*)\s*([%°]|\$|[a-z]+)?');

List<(String, String)> unidades(String s) {
  final t = norm(s).replaceAllMapped(_reAmPm, (m) => '${m[1]}m').replaceAll(_rePesos, '\$');
  final out = <(String, String)>[];
  for (final m in _reCifraUnidad.allMatches(t)) {
    final u = m[1] != null ? '\$' : (m[3] ?? '');
    out.add((m[2]!.replaceAll(_reSeparador, ''), _medida.contains(u) ? u : ''));
  }
  return out;
}

final _reProhibido = RegExp(
    r'(se puede comer|es comestible|comestible|venenos|toxic|alerta (amarilla|naranja|roja|verde)|nivel (amarillo|naranja|rojo|verde))');
// Solo para respuestas en inglés (la PWA también pide «en»). No está en slm.html: es una regla extra, no un cambio.
final _reProhibidoEn = RegExp(
    r'(edible|safe to eat|can (you|i|we) eat|poison|(yellow|orange|red|green) (alert|level)|alert level)');
final _rePreguntaFinal = RegExp(r'\?\s*$');

Veredicto verificar(String resp, String fuenteTxt, String pregunta, {String idioma = 'es'}) {
  final fallas = <String>[];
  final fuente = norm('$fuenteTxt $pregunta');
  final nf = numeros('$fuenteTxt $pregunta').toSet();
  for (final n in numeros(resp)) {
    if (!nf.contains(n)) fallas.add('cifra $n no está en la fuente');
  }
  final uf = unidades('$fuenteTxt $pregunta');
  for (final (n, u) in unidades(resp)) {
    if (u.isNotEmpty && nf.contains(n) && !uf.any((x) => x.$1 == n && x.$2 == u)) {
      fallas.add('la cifra $n no va con «$u» en la fuente');
    }
  }
  for (final w in propios(resp)) {
    if (!fuente.contains(norm(w)) && w != 'Fray') fallas.add('nombre «$w» no está en la fuente');
  }
  final rn = norm(resp);
  if (_reProhibido.hasMatch(rn) || (idioma == 'en' && _reProhibidoEn.hasMatch(rn))) {
    fallas.add('dice algo prohibido (comer, tóxico o alerta del volcán)');
  }
  final palabras = resp.trim().split(_reEspacios).length;
  if (palabras > 60) fallas.add('demasiado larga ($palabras palabras)');
  if (resp.trim().isEmpty) fallas.add('vacía');
  if (_rePreguntaFinal.hasMatch(resp.trim())) fallas.add('responde con una pregunta');
  if (rn.contains('no puedo responder')) fallas.add('esquiva la pregunta');
  final dijoNoSe = rn.contains('no tengo esa informacion') || rn.contains("i don't have that");
  return Veredicto(fallas.isEmpty, fallas, dijoNoSe);
}
