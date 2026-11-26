// Verificador determinista de respuestas generadas (Fray). Módulo ES: sirve en el navegador y en node.
//
// Pasa solo si todo lo que afirma la respuesta está en el texto del guion (más la pregunta). Pasar NO significa ser útil.
// Dos capas:
//  1. verificarBase(): port fiel de verificar() de laboratorio/slm.html (= herramientas/verificador_llm.py del repo
//     espeletia-ai, 25-nov), con las reglas añadidas ese día (raya tipográfica, «metros» = «m», otra escritura, basura).
//     La paridad se prueba con node pruebas/verificador.test.mjs contra pruebas/casos_verificador.json (campo fallas_lab).
//  2. reglasFray(): reglas del reto (26-nov) que prevalecen sobre el guion: nada de alertas ni estado del volcán, nada de
//     comer, tóxico o usos medicinales, nada de medicamentos ni de «toma…», y el relato debe presentarse como tradición oral.

export const NO_SE = 'No tengo esa información en los guiones oficiales; pregúntale a tu guía o al personal del parque.';

export const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- 1. Base (idéntica a slm.html) ----------
const PROHIBIDO = /(se puede comer|es comestible|comestible|venenos|toxic|alerta (amarilla|naranja|roja|verde)|nivel (amarillo|naranja|rojo|verde))/;
const numeros = (s) => (s.match(/\d+(?:[.,:]\d+)*/g) || []).map((n) => n.replace(/[.,:]/g, ''));
const propios = (s) => {
  const out = [];
  for (const frase of s.split(/[.!?¿¡]\s*/)) {
    for (const w of frase.trim().split(/\s+/).slice(1)) {
      const x = w.replace(/[^\p{L}-]/gu, '').replace(/^-+|-+$/g, '');
      if (x.length > 2 && /^\p{Lu}/u.test(x)) out.push(x);
    }
  }
  return out;
};
// Cifra + unidad: «2026 pesos» no vale si en la fuente 2026 es un año. Solo se comparan unidades de medida o de dinero.
const MEDIDA = new Set(['$', '%', '°', 'c', 'm', 'km', 'cm', 'ha', 'anos', 'ano', 'am', 'pm', 'metros', 'horas', 'hora', 'min', 'minutos', 'msnm']);
// Sinónimos de unidad: «4.450 metros» vale si la fuente dice «4.450 m».
// Extensión del 26-nov (no está en slm.html): «msnm» y «m.s.n.m.» cuentan como «m» («4.160 metros sobre el nivel del mar»).
const UNI = { metros: 'm', ano: 'anos', horas: 'hora', minutos: 'min', msnm: 'm' };
function unidades(s) {
  const t = norm(s).replace(/\bm\.\s?s\.\s?n\.\s?m\.?/g, 'msnm').replace(/\b([ap])\.\s?m\./g, '$1m').replace(/\bpesos\b|\bcop\b/g, '$');
  const out = [];
  for (const m of t.matchAll(/(\$\s?)?(\d+(?:[.,:]\d+)*)\s*([%°]|\$|[a-z]+)?/g)) {
    const u0 = m[1] ? '$' : (m[3] || ''); const u = UNI[u0] || u0;
    out.push([m[2].replace(/[.,:]/g, ''), MEDIDA.has(u) ? u : '']);
  }
  return out;
}
// Rayas y guiones tipográficos («Brisas–Valle») cuentan como guion simple, en la respuesta y en la fuente.
const guiones = (s) => s.replace(/[‐-―]/g, '-');

export function verificarBase(resp, fuenteTxt, pregunta) {
  resp = guiones(resp); fuenteTxt = guiones(fuenteTxt); pregunta = guiones(pregunta);
  const fallas = [];
  const fuente = norm(fuenteTxt + ' ' + pregunta);
  const nf = new Set(numeros(fuenteTxt + ' ' + pregunta));
  for (const n of numeros(resp)) if (!nf.has(n)) fallas.push(`cifra ${n} no está en la fuente`);
  const uf = unidades(fuenteTxt + ' ' + pregunta);
  for (const [n, u] of unidades(resp)) {
    if (u && nf.has(n) && !uf.some(([n2, u2]) => n2 === n && u2 === u)) fallas.push(`la cifra ${n} no va con «${u}» en la fuente`);
  }
  for (const w of propios(resp)) if (!fuente.includes(norm(w)) && w !== 'Fray') fallas.push(`nombre «${w}» no está en la fuente`);
  if (PROHIBIDO.test(norm(resp))) fallas.push('dice algo prohibido (comer, tóxico o alerta del volcán)');
  const palabras = resp.trim().split(/\s+/).length;
  if (palabras > 60) fallas.push(`demasiado larga (${palabras} palabras)`);
  if (!resp.trim()) fallas.push('vacía');
  if (/\?\s*$/.test(resp.trim())) fallas.push('responde con una pregunta');
  if (/no puedo responder/.test(norm(resp))) fallas.push('esquiva la pregunta');
  if (/[^\P{Nd}0-9]/u.test(resp) || /(?!\p{Script=Latin})\p{L}/u.test(resp)) fallas.push('usa letras o cifras de otra escritura');
  if (/(.)\1{4,}/u.test(resp)) fallas.push('texto basura (un carácter repetido)');
  return { ok: fallas.length === 0, fallas, dijoNoSe: norm(resp).includes('no tengo esa informacion oficial') };
}

// ---------- 2. Reglas del reto (prevalecen sobre el guion y sobre el modelo) ----------
const ALERTA = /\balerta|\bnivel (de )?(actividad|alerta)|\bsemaforo\b/;
const VOLCAN = /\b(volcan|volcanes|volcanico|nevado|crater|arenas|ruiz)\b/;
// Afirmar cómo está el volcán ahora (aunque sea «tranquilo»): eso lo dice el SGC y el personal del parque.
const ESTADO_VOLCAN = /\b(hoy|ahora|actualmente|en este momento|estos dias|esta semana|estado|tranquilo|calmado|dormido|inactivo|apagado|seguro|sin peligro|no hay peligro|no hay riesgo|sin riesgo|enojad[oa]|brav[oa]|furios[oa]|despiert[oa]|despertando|va a hacer erupcion|erupcion inminente|esta en erupcion|hara erupcion|puede hacer erupcion)\b/;
const COMER = /\b(se puede(n)? comer|se come(n)?|puedes comer|pueden comer|comerl[ao]s?|comestibles?|apt[ao]s? para (el )?consumo|se puede(n)? tomar|venenos[ao]s?|toxic[ao]s?|medicinal(es)?|remedios?|curar|cura (el|la|los|las)|infusion(es)?|aromatica)\b/;
const MEDICAMENTO = /\b(acetazolamida|ibuprofeno|acetaminofen|paracetamol|aspirina|naproxeno|dexametasona|diamox|dolex|advil|sorojchi|pastillas?|tabletas?|capsulas?|medicamentos?|medicinas?|farmacos?|dosis|mg|miligramos|recet(a|ar|o))\b/;
// «toma…», «tome…», «tomar…» seguido de algo ingerible (pero no «toma una foto» ni «el recorrido toma 3 horas»).
const TOMA = /\b(toma|tome|tomar|tomate|tomese|tomen|bebe|beba|beber)\b(\s+\S+){0,3}?\s+(agua de|te\b|aguas?\s+aromatica|hojas?|planta|pastilla|tableta|medicamento|medicina|gotas|dosis|jarabe|coca)/;
const RELATO = /(tradicion oral|segun (la tradicion|el relato|la leyenda|los relatos|cuentan)|se cuenta|cuenta(n)? (la|el|que)|relato|leyenda|mito)/;

export function reglasFray(resp, fuenteTxt = '', opciones = {}) {
  const t = norm(guiones(resp));
  const fallas = [];
  if (ALERTA.test(t)) fallas.push('reto: menciona una alerta o nivel del volcán');
  if (VOLCAN.test(t) && ESTADO_VOLCAN.test(t)) fallas.push('reto: afirma el estado del volcán (eso lo dice el personal del parque)');
  if (COMER.test(t)) fallas.push('reto: habla de comer, tóxico o usos medicinales');
  if (MEDICAMENTO.test(t) || TOMA.test(t)) fallas.push('reto: habla de medicamentos o de tomar algo');
  if (!opciones.relato && /tradicion oral/.test(t) && !/tradicion oral/.test(norm(fuenteTxt))) fallas.push('reto: presenta como tradición oral algo que no es relato');
  // Cifra real con otra unidad: «4.160 visitantes» cuando en el guion 4.160 solo aparece como «4.160 msnm».
  const conUnidad = new Map();
  for (const [n, u] of unidades(fuenteTxt)) { if (!conUnidad.has(n)) conUnidad.set(n, true); if (!u) conUnidad.set(n, false); }
  for (const m of t.replace(/\bpesos\b|\bcop\b/g, '$').matchAll(/(\d+(?:[.,:]\d+)*)\s+([a-z]{3,})/g)) {
    const n = m[1].replace(/[.,:]/g, ''); const w = UNI[m[2]] || m[2];
    if (conUnidad.get(n) && !MEDIDA.has(w) && !/^(de|del|y|o|a|sobre|en|por|para|al)$/.test(m[2])) fallas.push(`reto: la cifra ${n} va con «${m[2]}» pero en el guion es una medida`);
  }
  if (opciones.relato && !RELATO.test(t)) fallas.push('reto: un relato debe presentarse como tradición oral');
  if (t.includes('no tengo esa informacion')) fallas.push('reto: el modelo se abstuvo (queda el texto del guion)');
  return fallas;
}

// verificar(resp, fuente, pregunta, { relato }) → { ok, fallas, dijoNoSe, base, reto }
export function verificar(resp, fuenteTxt, pregunta, opciones = {}) {
  const b = verificarBase(resp, fuenteTxt, pregunta);
  const reto = reglasFray(resp, fuenteTxt, opciones);
  const fallas = [...b.fallas, ...reto];
  return { ok: fallas.length === 0, fallas, dijoNoSe: b.dijoNoSe || norm(resp).includes('no tengo esa informacion'), base: b.fallas, reto };
}

// ---------- 3. Respaldo por frase (anti-alucinación) ----------
// Cada frase generada debe apoyarse en UNA frase del texto del guion. Con embeddings (e5: «query:» de la frase generada contra
// «passage:» de las frases fuente, similitud coseno) si el motor los expone; si no, respaldo léxico: fracción de las palabras con
// contenido de la frase generada (raíz de 5 letras) presentes en una sola frase fuente. Las palabras que vienen de la pregunta no
// cuentan como afirmación nueva (se quitan del denominador). Además, cada cifra de la frase generada debe estar en su frase de
// respaldo y no puede perder su cuantificador («3 de los 6 glaciares» ≠ «6 glaciares»).
// Revisado el 26-nov con la medida del REDMI: con 0,5 atrapa 10/15 errores y descarta 12/61 correctas; bajarlo a 0,40 (la
// paráfrasis de las dunas) dejaría pasar 3 inventos reales («100 especies en Colombia», «pelitos que atrapan agua», el origen
// del nombre Aguacerales). Se queda en 0,5: un falso rechazo solo cuesta tono (queda el texto del guion).
export const UMBRAL_LEXICO = 0.5;
export const UMBRAL_E5 = 0.85;      // PENDIENTE de calibrar con el motor (e5-small en el navegador)
export const UMBRAL_VECINA = 0.7;   // respaldo mínimo para aceptar una cifra de la frase vecina (casos 4.160 msnm del REDMI)

const VACIAS = new Set(('que los las del por con una uno unos unas para como mas pero sus este esta estos estas ese esa eso esto ' +
  'son fue ser era han hay muy tambien cual cuales donde cuando porque pues asi sobre entre desde hasta sin ante bajo tras ' +
  'otro otra otros otras todo toda todos todas cada aqui alli ahi nos les lo le se su al el la de en y o a es un ya ha').split(' '));
const NEGACION = new Set(['no', 'nunca', 'jamas', 'ningun', 'ninguna', 'ninguno', 'tampoco']);

export const frases = (s) => String(s || '').split(/(?<=[.!?;])\s+|\n+/).map((x) => x.trim()).filter((x) => /[\p{L}\d]/u.test(x));
const palabras = (s) => norm(s).replace(/(metros|m) sobre el nivel del mar|\bm\.\s?s\.\s?n\.\s?m\.?/g, 'msnm').replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/)
  .filter((w) => NEGACION.has(w) || (w.length >= 3 && !VACIAS.has(w))).map((w) => (/^\d/.test(w) ? w : w.slice(0, 5)));

// Cláusulas: además de frases, se parte en «; », «, y », «, mientras que », «, pero », «, además» para que un dato añadido al
// final de una frase bien respaldada («…, y además sirve de alimento al oso») tenga que respaldarse por sí solo.
export const clausulas = (s) => frases(s).flatMap((f) => f.split(/;\s+|,\s+(?=y\s|e\s|mientras que\s|pero\s|además\s|aunque\s)/i))
  .map((x) => x.trim()).filter((x) => palabras(x).length >= 2);

// Respaldo léxico: la mejor frase fuente (ventana=1, la calibrada); ventana=2 admite dos frases consecutivas (menos rechazos, menos errores atrapados).
export function respaldoLexico(frasesGen, frasesFuente, { pregunta = '', ventana = 1 } = {}) {
  const deLaPregunta = new Set(palabras(pregunta));
  const vent = [];
  for (let i = 0; i < frasesFuente.length; i++) for (let k = 1; k <= ventana && i + k <= frasesFuente.length; k++) vent.push(frasesFuente.slice(i, i + k).join(' '));
  const fuentes = vent.map((f) => new Set(palabras(f)));
  return frasesGen.map((frase) => {
    const W = [...new Set(palabras(frase))].filter((w) => !deLaPregunta.has(w) || /^\d/.test(w));
    if (!W.length) return { frase, mejor: -1, sim: 1, fraseFuente: null };
    let mejor = -1; let sim = 0;
    fuentes.forEach((S, i) => { const s = W.filter((w) => S.has(w)).length / W.length; if (s > sim + 1e-9) { sim = s; mejor = i; } });
    return { frase, mejor, sim: Math.round(sim * 100) / 100, fraseFuente: mejor >= 0 ? vent[mejor] : null, vecinas: vecinas(vent, mejor) };
  });
}
// Frases vecinas (anterior y siguiente) de la frase de respaldo: una cifra puede venir de la frase de al lado («Altura: 4.160
// msnm aproximadamente. Ubicación: flanco occidental…» → «Estamos a 4.160 msnm, en el flanco occidental…»; medido en el REDMI).
const vecinas = (lista, i) => (i < 0 ? '' : [lista[i - 1] || '', lista[i + 1] || ''].join(' '));

const coseno = (a, b) => { let p = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { p += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return p / Math.sqrt(na * nb || 1); };

// respaldo(frasesGen, frasesFuente, { embeber, pregunta }) → [{ frase, mejor, sim, fraseFuente }]
// embeber(textos) → Promise<number[][]>: función del motor (e5) que recibe los textos ya con prefijo «query: »/«passage: ».
export async function respaldo(frasesGen, frasesFuente, { embeber = null, pregunta = '' } = {}) {
  if (!embeber) return respaldoLexico(frasesGen, frasesFuente, { pregunta });
  const [vg, vs] = await Promise.all([embeber(frasesGen.map((f) => 'query: ' + f)), embeber(frasesFuente.map((f) => 'passage: ' + f))]);
  return frasesGen.map((frase, i) => {
    let mejor = -1; let sim = -1;
    vs.forEach((v, j) => { const s = coseno(vg[i], v); if (s > sim) { sim = s; mejor = j; } });
    return { frase, mejor, sim: Math.round(sim * 1000) / 1000, fraseFuente: mejor >= 0 ? frasesFuente[mejor] : null, vecinas: vecinas(frasesFuente, mejor) };
  });
}

// Fallas de respaldo: frase por debajo del umbral, cifra que no está en su frase de respaldo (ni en la pregunta), cuantificador
// perdido, y polaridad: si la frase del guion niega y la generada no («estas rocas NO fueron arrojadas por el volcán» → «sí, las
// dejó el volcán»), o al revés.
const NIEGA = /(^|[^a-z])(no|nunca|jamas|ningun|ninguna|ninguno|tampoco)(?![a-z])/;
// Desaparición: si la frase del guion dice que algo desapareció o se extinguió y la generada no («han desaparecido de muchos
// páramos, como el venado de cola blanca» → «hay venados de cola blanca en el páramo»), la generada invierte el sentido.
const DESAPARECE = /(^|[^a-z])(desaparec|extint|extingu|ya no (hay|existe|se ve))/;
// Cifras comparables: «4.160» = «4,160» = «4 160» = «4160»; «2,24» = «2.24». Se quitan separadores de miles y decimales.
export const cifras = (s) => (String(s).replace(/(\d)[   ](?=\d{3}(?!\d))/g, '$1').match(/\d+(?:[.,:]\d+)*/g) || []).map((n) => n.replace(/[.,:]/g, ''));
export function fallasRespaldo(res, { umbral = UMBRAL_LEXICO, pregunta = '' } = {}) {
  const fallas = [];
  for (const r of res) {
    if (r.sim < umbral) { fallas.push(`frase sin respaldo (${r.sim}): «${r.frase.slice(0, 80)}»`); continue; }
    if (!r.fraseFuente) continue;
    const g = norm(guiones(r.frase)); const f = norm(guiones(r.fraseFuente));
    if (NIEGA.test(f) && !NIEGA.test(g)) fallas.push(`pierde una negación del guion: «${r.frase.slice(0, 60)}»`);
    if (!NIEGA.test(f) && NIEGA.test(g)) fallas.push(`añade una negación que el guion no tiene: «${r.frase.slice(0, 60)}»`);
    if (DESAPARECE.test(f) && !DESAPARECE.test(g)) fallas.push(`omite que el guion dice que desapareció: «${r.frase.slice(0, 60)}»`);
    // La cifra debe estar en su frase de respaldo; o en una vecina si la frase está muy bien respaldada (≥ UMBRAL_VECINA = 0,7: une
    // dos frases de datos seguidas). Con respaldo flojo no basta la vecina: «23,000 personas» pegado a otro sujeto se atrapa.
    const nf = new Set([...cifras(f), ...(r.sim >= UMBRAL_VECINA ? cifras(norm(r.vecinas || '')) : []), ...cifras(norm(pregunta))]);
    for (const n of cifras(g)) if (!nf.has(n)) fallas.push(`cifra ${n} no está en su frase de respaldo`);
    for (const m of f.matchAll(/(\d+(?:[.,]\d+)*)\s+de\s+(?:los|las)\s+(\d+(?:[.,]\d+)*)/g)) {
      const total = m[2].replace(/[.,]/g, '');
      const enGen = [...g.matchAll(/(\d+(?:[.,]\d+)*)(?=\s|$|[^\d])/g)].some((x) => x[1].replace(/[.,]/g, '') === total &&
        !/\d+\s+de\s+(los|las)\s+$/.test(g.slice(0, x.index)));
      if (enGen) fallas.push(`la cifra ${total} pierde su cuantificador («${m[0]}» en el guion)`);
    }
  }
  return fallas;
}
