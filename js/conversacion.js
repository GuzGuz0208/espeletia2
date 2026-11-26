// Conversación de Fray: charla y seguimiento, deterministas (sin modelo, sin red). Copia en Python: herramientas/fray_py.py
// (INTENCIONES, RELLENO, intencion, conversar, anotar). herramientas/paridad.py exige diferencia 0. Si cambias algo aquí,
// cámbialo allá.
//
// Orden dentro de fray.preguntar (contrato §2): carril de seguridad (siempre primero) → charla → búsqueda.
// - Charla: saludo, gracias, despedida, ayuda, quién eres, afirmación corta. Textos fijos y cortos de Fray, SIN datos del
//   parque ni cifras, con 3 sugerencias de preguntas sacadas de las `preguntas` de las fichas (de la estación si la hay).
// - Seguimiento: «amplía», «cuéntame más», «no entendí», «más sencillo»… usa la ÚLTIMA respuesta de la sesión:
//   ampliar → frases de la misma ficha aún no mostradas (o la ficha relacionada siguiente, con su cita); sencillo → la frase
//   más corta de la misma ficha. Es `tipo: 'respuesta'` con cita, así que el generador y el verificador la tratan igual.
// - Solo es charla si TODA la frase es charla (más relleno: «fray», «por favor», «mejor»…). «hola, ¿qué es el frailejón?»
//   va a la búsqueda normal. El carril corre antes: «hola, me siento mareado» es seguridad.
import { normalizarCarril, categoriaCarril } from './carril.js';
import { frases } from './nucleo.js';

// Patrones sobre el texto normalizado (minúsculas, sin tildes, solo [a-z0-9] y espacios). Solo palabras, (?:…), | y ?:
// así significan lo mismo en JS y en Python. Gana el patrón más largo que case al principio; empate → orden de esta lista.
export const INTENCIONES = [
  { id: 'sencillo', p: [
    'no (?:te |le )?(?:entendi|entiendo|comprendo|comprendi|capte)', 'no (?:me )?quedo claro', 'que (?:significa|quiere decir) (?:eso|esto)',
    '(?:mas|muy) (?:sencillo|facil|simple|claro|corto)', 'en (?:palabras )?(?:sencillas|simples|pocas palabras)',
    '(?:explicame|explicamelo|explicalo|dimelo|dilo|dime) (?:mas )?(?:sencillo|facil|simple|claro|corto)',
    'resumelo', 'resume', 'resumen', 'como para un nino', 'que', 'como', 'i don t understand', 'i dont understand', 'simpler',
  ] },
  { id: 'mas', p: [
    'ampliame', 'amplialo', 'ampliala', 'amplia', 'ampliar', 'complementa', 'complementalo', 'complementala', 'complementame', 'complementar(?:lo|la)?',
    'cuentame', 'cuentamelo', 'dime', 'quiero saber', 'explicame', 'explicamelo', 'explicalo', 'explica', 'profundiza', 'detalla', 'desarrolla',
    'sigue', 'continua', 'mas detalles', 'mas informacion', 'mas info', 'mas datos', 'detalles', 'dame (?:mas )?(?:detalles|informacion|info|datos)',
    'algo mas', 'hay mas', 'y que mas', 'otro dato', 'otra cosa', 'y eso', 'y eso por que', 'por que', 'como asi', 'en serio', 'ampliar informacion',
    'tell me more', 'more', 'more details', 'go on', 'elaborate', 'and', 'why',
  ] },
  { id: 'ayuda', p: [
    'ayuda', 'ayudame', 'que (?:puedes|sabes|puedo) hacer', 'que haces', 'para que sirves', 'para que sirve (?:esto|esta app|la app)',
    'como (?:funcionas|funciona|te uso|se usa|uso esto)', 'que (?:te )?(?:puedo|se puede) preguntar(?:te)?', 'que (?:sabes|preguntas)',
    '(?:de|sobre) que (?:sabes|me puedes hablar|hablas)', 'que me puedes (?:contar|decir|explicar)', 'menu', 'opciones',
    'que (?:me )?(?:ensenas|vas a ensenar(?:me)?|me vas a mostrar)', 'que (?:vamos a|voy a) (?:ver|descubrir|aprender|conocer|hacer)',
    '(?:entonces )?no me (?:puedes|sabes) (?:responder|contestar|decir) nada',
    'what can you do', 'what do you know', 'how does this work', 'how do you work',
  ] },
  { id: 'quien', p: [
    'quien eres', 'quien sos', 'quien te (?:hizo|creo|programo|invento|diseno|construyo)', 'quienes te (?:hicieron|crearon)', 'quien es fray', 'que eres', 'como te llamas', 'cual es tu nombre', 'tu nombre', 'eres (?:un |una )?(?:robot|ia|inteligencia artificial|humano|persona|real|guia)',
    'who are you', 'what are you', 'what is your name', 'whats your name', 'are you (?:a )?(?:robot|human|ai)',
  ] },
  { id: 'gracias', p: [
    'gracias', 'muchas gracias', 'mil gracias', 'muchisimas gracias', 'te agradezco', 'que amable', 'muy amable', 'thanks', 'thank you', 'thx',
  ] },
  { id: 'despedida', p: [
    'adios', 'chao', 'chau', 'hasta luego', 'hasta pronto', 'hasta la proxima', 'nos vemos', 'me voy', 'bye', 'goodbye', 'see you',
  ] },
  { id: 'saludo', p: [
    'hola', 'holi', 'holis', 'ola', 'buenas', 'buenos dias', 'buen dia', 'buenas tardes', 'buenas noches', 'saludos', 'que tal', 'que mas',
    'quiubo', 'quihubo', 'q onda', 'que onda', 'q mas', 'que hubo', '(?:h?ola|hey) (?:q|que) (?:onda|mas|hubo|tal)', 'como estas', 'como esta', 'como vas', 'como te va', 'hello', 'hi', 'hey', 'good morning', 'good afternoon',
    'good evening', 'how are you',
  ] },
  { id: 'corta', p: [
    'ok', 'okay', 'okey', 'oki', 'vale', 'listo', 'si', 'sii', 'siii', 'no', 'claro', 'perfecto', 'genial', 'chevere', 'bacano', 'super', 'excelente',
    'entiendo', 'entendido', 'ya entendi', 'ya veo', 'interesante', 'que bien', 'que bueno', 'que chevere', 'que interesante', 'wow', 'guau', 'uau',
    'ja(?:ja)+', 'je(?:je)+', 'ji(?:ji)+', 'ha(?:ha)+', 'jsjs(?:js)*', 'lol', 'xd', 'de acuerdo', 'bien', 'muy bien', 'aja', 'mm+', 'hm+', 'ah', 'oh',
    'cool', 'nice', 'yes', 'yeah', 'sure', 'great', 'got it', 'i see',
  ] },
];
// Palabras de relleno que no cambian la intención («fray, cuéntame MÁS por favor», «¿puedes complementarlo MEJOR?»)
export const RELLENO = '(?:fray|por favor|porfa|porfavor|please|pues|bueno|oye|oiga|mira|y|e|eh|entonces|ya|amigo|amiga|muy|tu|usted|' +
  'mas|mejor|un poco|un poquito|poco|eso|esto|lo|la|me|te|le|sobre eso|de eso|acerca de eso|del tema|puedes|podrias|puede|podria|quiero que|' +
  'me puedes|me podrias|por fa|bien|ahora|otra vez|de nuevo|also|more|please|can you|could you|it|that|this)';

const RE = INTENCIONES.map((it) => ({ id: it.id, p: it.p.map((p) => new RegExp('^(?:' + p + ')(?: |$)')) }));
const RE_RELLENO = new RegExp('^' + RELLENO + '(?: |$)');

// Intención de charla de TODA la frase, o null (si sobra alguna palabra que no sea charla ni relleno → búsqueda normal).
export function intencion(texto) {
  let t = normalizarCarril(texto).trim();
  const vistas = [];
  for (let vuelta = 0; vuelta < 12 && t; vuelta++) {
    let mejor = null, largo = 0, prio = 99;
    RE.forEach((it, i) => {
      for (const re of it.p) {
        const m = t.match(re);
        if (m && m[0].length > largo) { mejor = it.id; largo = m[0].length; prio = i; }
      }
    });
    if (mejor) { vistas.push(prio); t = t.slice(largo); continue; }
    const r = t.match(RE_RELLENO);
    if (r) { t = t.slice(r[0].length); continue; }
    return null;
  }
  if (t || !vistas.length) return null;
  return INTENCIONES[Math.min(...vistas)].id;
}

// «hola fray, ¿qué es la gelifracción?» → «¿qué es la gelifracción?»: quita el saludo o el agradecimiento del principio
// (y «fray») antes de buscar, para que no diluya la búsqueda léxica. Si no queda nada, devuelve el texto igual.
const RE_PREFIJO = new RegExp('^(?:(?:' + INTENCIONES.filter((it) => it.id === 'saludo' || it.id === 'gracias')
  .flatMap((it) => it.p).concat('fray').sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).join('|') + ')(?: |$))+');
export function sinCharla(texto) {
  const t = normalizarCarril(texto).trim();
  const m = t.match(RE_PREFIJO);
  if (!m) return texto;
  const n = m[0].trim().split(' ').length;
  const resto = String(texto).replace(new RegExp('^(?:[^\\p{L}\\p{N}]*[\\p{L}\\p{N}]+){' + n + '}[^\\p{L}\\p{N}¿¡]*', 'u'), '');
  return /[\p{L}\p{N}]/u.test(resto) ? resto : texto;
}

// Textos fijos de Fray (sin datos del parque, sin cifras). La interfaz puede traducirlos por `intencion`.
export const TEXTOS = {
  saludo: '¡Hola! Soy Fray, tu compañero de ruta en el páramo. Pregúntame lo que veas; te respondo con los guiones oficiales del parque. Por ejemplo:',
  gracias: '¡Con gusto! Si te surge otra pregunta, aquí estoy. Por ejemplo:',
  despedida: '¡Que disfrutes la caminata! Sigue siempre las indicaciones de tu guía. Si vuelves a tener una duda, aquí estoy.',
  ayuda: 'Te explico lo que ves en el recorrido: plantas, animales, rocas, agua, historia y relatos del páramo, siempre con la página del guion oficial. Si me dices en qué estación estás, afino la respuesta. Lo que cambia cada día lo decide tu guía. Prueba con:',
  quien: 'Soy Fray, un asistente que funciona sin señal en tu teléfono. No invento: respondo con los guiones oficiales del parque y te digo la página. Tu guía va siempre primero. Puedes preguntarme:',
  corta: '¡Bien! ¿Quieres saber algo más? Puedes preguntarme:',
  sinUltima: '¿Sobre qué quieres saber más? Pregúntame algo del páramo, por ejemplo:',
  fin: 'Eso es todo lo que dicen los guiones sobre este tema; tu guía puede contarte más. También puedes preguntarme:',
};

export function nuevaConversacion() { return { ultima: null, vuelta: 0 }; }

const utilizables = (paquete) => (paquete?.fichas || []).filter((f) => f && !f.bloqueada && f.id && (f.texto || f.breve));
const citasDe = (f, fuentes) => (f.citas || []).map((c) => ({ guion: c.guion, titulo: fuentes?.[c.guion]?.titulo || c.guion, pagina: c.pagina }));
const clave = (s) => normalizarCarril(s).trim();

// 3 preguntas de ejemplo: de las fichas de la estación (o de toda la ruta), sin salud, sin las que disparan el carril y sin
// las que serían charla. Rotan con `vuelta` para no repetir siempre las mismas.
export function sugerencias(paquete, estacion, vuelta = 0, n = 3) {
  const fs = utilizables(paquete).filter((f) => f.tema !== 'salud');
  const deEst = estacion ? fs.filter((f) => f.estacion === estacion) : [];
  const base = deEst.length ? deEst : fs;
  const cand = [];
  for (const f of base) {
    const q = (f.preguntas || []).find((x) => x && !categoriaCarril(x) && !intencion(x) && !/^(what|where|how|why|who|is|are|can|do|does) /.test(clave(x) + ' '));
    if (q && !cand.some((c) => clave(c) === clave(q))) cand.push(q);
  }
  if (!cand.length) return [];
  const paso = Math.max(1, Math.floor(cand.length / n));
  const out = [];
  for (let k = 0; out.length < Math.min(n, cand.length) && k < cand.length * 2; k++) {
    const q = cand[(vuelta * n + k * paso + Math.floor(k / n)) % cand.length];
    if (!out.includes(q)) out.push(q);
  }
  return out;
}

function charla(id, paquete, estacion, estado) {
  const sug = sugerencias(paquete, estacion, estado.vuelta++);
  return { tipo: 'charla', intencion: id, breve: TEXTOS[id], ampliar: null, citas: [], fichas: [], tipoContenido: null, alternativas: [], aviso: null, sugerencias: sug };
}

// Índices de las frases de la ficha ya contenidas en un texto mostrado
const vistasEn = (fr, texto) => fr.map((s, k) => (String(texto || '').includes(s) ? k : -1)).filter((k) => k >= 0);

function respuestaFicha(f, paquete, breve, modo) {
  return { tipo: 'respuesta', breve, fraseRespaldo: breve, ampliar: f.texto || f.breve || null, citas: citasDe(f, paquete.fuentes),
    fichas: [f.id], tipoContenido: f.tipo || null, alternativas: [], aviso: null, seguimiento: modo };
}

function seguir(id, paquete, estacion, estado) {
  const u = estado.ultima;
  const fs = utilizables(paquete);
  const f = u && fs.find((x) => x.id === u.id);
  if (!f) return { ...charla('sinUltima', paquete, estacion, estado), intencion: id };
  const fr = frases(f.texto || f.breve);
  if (id === 'sencillo') {
    let k = 0; fr.forEach((s, i) => { if (s.length < fr[k].length) k = i; });
    const breve = fr[k] || f.breve || f.texto;
    if (!u.vistas.includes(k)) u.vistas.push(k);
    return respuestaFicha(f, paquete, breve, 'sencillo');
  }
  // «más»: frases aún no mostradas de la misma ficha (sin repetir textos ya vistos), hasta 2 y unos 220 caracteres
  const vistos = new Set(u.vistas.map((k) => clave(fr[k] || '')));
  const pend = fr.map((s, k) => k).filter((k) => !u.vistas.includes(k) && !vistos.has(clave(fr[k])));
  if (pend.length) {
    const tomadas = [pend[0]];
    if (pend.length > 1 && fr[pend[0]].length < 220 && fr[pend[0]].length + fr[pend[1]].length <= 320) tomadas.push(pend[1]);
    u.vistas.push(...tomadas);
    return respuestaFicha(f, paquete, tomadas.map((k) => fr[k]).join(' '), 'ampliar');
  }
  // Ya se mostró toda la ficha: la siguiente relacionada (misma estación y tema; luego mismo tema; luego misma estación)
  const est = estacion || f.estacion || null;
  const libres = fs.filter((x) => !u.cadena.includes(x.id) && x.tema !== 'salud');
  const sig = libres.find((x) => x.tema && x.tema === f.tema && est && x.estacion === est)
    || libres.find((x) => x.tema && x.tema === f.tema)
    || libres.find((x) => est && x.estacion === est);
  if (!sig) return { ...charla('fin', paquete, estacion, estado), intencion: id };
  const frs = frases(sig.texto || sig.breve);
  const breve = sig.breve || frs[0] || sig.texto;
  estado.ultima = { id: sig.id, vistas: vistasEn(frs, breve), cadena: [...u.cadena, sig.id] };
  return respuestaFicha(sig, paquete, breve, 'relacionada');
}

// conversar(texto, { paquete, estacion, estado }) → respuesta de charla/seguimiento o null (→ búsqueda normal).
// No evalúa el carril: fray.preguntar lo evalúa antes.
export function conversar(texto, { paquete, estacion = null, estado }) {
  const id = intencion(texto);
  if (!id) return null;
  if (id === 'mas' || id === 'sencillo') return seguir(id, paquete, estacion, estado);
  return charla(id, paquete, estacion, estado);
}

// Tras la búsqueda: recuerda la última respuesta con ficha (para el seguimiento). Abstención, duda o seguridad la olvidan.
export function anotar(estado, r, paquete) {
  if (!r || !(r.tipo === 'respuesta' || r.tipo === 'conflicto') || !(r.fichas || []).length) { estado.ultima = null; return; }
  const f = utilizables(paquete).find((x) => x.id === r.fichas[0]);
  if (!f) { estado.ultima = null; return; }
  const fr = frases(f.texto || f.breve);
  estado.ultima = { id: f.id, vistas: vistasEn(fr, r.tipo === 'conflicto' ? (f.breve || '') : r.breve), cadena: [...r.fichas] };
}
