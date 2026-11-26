// Pantalla "Pregúntale a Fray": conversación sin internet con el motor nuevo (js/fray-chat.js → js/fray.js).
// Cada respuesta sale de los guiones oficiales con su cita (guion y página). Seguridad primero: el carril crítico
// prevalece siempre. Si hay IA local lista, reescribe la respuesta; solo se muestra si pasa el verificador, con la marca
// «redactado por IA local · verificado» y la frase del guion debajo.
import * as fray from './fray-chat.js';
import * as ml from './ml.js';
import { E, cromo as getCromo, cromos, nombreClase } from './estado.js';
import { t, citar } from './i18n.js';
import { $, h, esc, animar, vibrar, escuchar, aviso } from './util.js';
import { personajes } from './art.js';
import { sync } from './ui-sync.js';

let iniciado = false;
// Tope de espera de la IA local (desde que se envía la pregunta): si no termina a tiempo, se muestra el texto del guion
const TOPE_MS = 4500;
let tema = null; // { id, ficha, es, en }: de qué se está hablando (Lente, cromo o foto)
let verEnMapa = null;  // (lugar) => abre el mapa en ese lugar (lo conecta app.js)
let pendiente = null;  // { tema, intro }: al llegar a una estación, se ofrece hablar de ella la próxima vez que se abra el chat
const ofrecidos = new Set();

export function conectarMapa(fn) { verEnMapa = fn; }
export function ofrecerLugar(nuevo, intro) {
  if (!nuevo || ofrecidos.has(nuevo.id)) return;
  pendiente = { tema: nuevo, intro };
}

export function iniciarChatUI() {
  $('#chat-form').onsubmit = (e) => { e.preventDefault(); const v = $('#chat-in').value.trim(); if (v) { $('#chat-in').value = ''; enviar(v); } };
  $('#chat-pj').innerHTML = personajes.fray(56);
  $('#chat-tema-x').onclick = () => { ponerTema(null); $('#chat-in').focus(); };
  $('#chat-foto').onclick = () => $('#chat-foto-in').click();
  iniciarDictado();
  $('#chat-foto-in').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) queEsEsto(f); };
}

// El tema sale de un cromo: su ficha de los guiones y cómo nombrarlo ("el frailejón")
export function temaDeCromo(id) {
  const c = getCromo(id);
  return c?.guion?.ficha ? { id: c.id, ficha: c.guion.ficha, es: c.tema?.es || c.es.nombre, en: c.tema?.en || c.es.nombre } : null;
}

function ponerTema(nuevo) {
  tema = nuevo;
  const box = $('#chat-tema');
  box.hidden = !tema;
  if (tema) $('.chat-tema-txt', box).innerHTML = t('chat.hablandoDe', { tema: `<b>${esc(tema[E.lang] || tema.es)}</b>` });
}

// Abrir el chat hablando de algo (desde la Lente, un sobre, un cromo o una foto): muestra la ficha del guion
// de ese cromo con su cita y sugiere otras preguntas de la ficha. Si no hay ficha, se le pregunta a Fray por el tema.
export async function abrirConTema(nuevo, { intro = null } = {}) {
  if (!nuevo) return;
  if (!iniciado) { iniciado = true; bienvenida(); }
  ponerTema(nuevo);
  const f = fray.fichaPorId(nuevo.ficha);
  if (!f) { await enviar(nuevo[E.lang] || nuevo.es); return; }
  agregar(h(`<article class="msg fray tema-intro"><p>${esc(intro || t('chat.temaHola', { tema: nuevo[E.lang] || nuevo.es }))}</p></article>`));
  agregar(tarjeta({ tipo: 'respuesta', breve: f.breve, ampliar: f.texto, citas: f.citas, tipoContenido: f.tipo }));
  const box = $('#chat-sug');
  box.innerHTML = '';
  const bonita = (q) => q.replace(/^(¿?\s*)(\p{L})/u, (_, a, b) => a + b.toUpperCase());
  for (const q of (f.preguntas || []).slice(1, 4)) {
    const b = h(`<button class="chip">${esc(bonita(q))}</button>`);
    b.onclick = () => { box.hidden = true; enviar(b.textContent); };
    box.appendChild(b);
  }
  box.hidden = !box.children.length;
}

// «¿Qué es esto?»: una foto pasa por la Lente; si la reconoce con seguridad, se vuelve el tema.
async function queEsEsto(archivo) {
  $('#chat-sug').hidden = true;
  const url = URL.createObjectURL(archivo);
  agregar(h(`<div class="msg yo msg-foto"><img src="${url}" alt="${esc(t('chat.tuFoto'))}"></div>`));
  const pensando = agregar(h(`<div class="msg fray pensando" aria-label="${esc(t('chat.mirando'))}"><span></span><span></span><span></span></div>`));
  let r = null, motivo = 'chat.fotoDuda';
  try {
    await ml.load();
    const cfg = E.paquete.camara;
    const listas = Object.values(ml.counts()).filter((n) => n >= cfg.minPorClase).length;
    if (listas < 2) motivo = 'chat.fotoSinLente';
    else {
      const bmp = await createImageBitmap(archivo);
      try { r = await ml.classify(bmp, cfg); } finally { bmp.close?.(); }
    }
  } catch (e) { console.error(e); motivo = 'lente.sinModelo'; }
  pensando.remove();
  const cfg = E.paquete.camara;
  if (r && r.clase !== 'otro' && r.confianza >= (ml.umbral() ?? cfg.umbral)) {
    const c = cromos().find((k) => k.tipo === 'camara' && k.clase === r.clase);
    const nuevo = c && temaDeCromo(c.id);
    if (nuevo) {
      await abrirConTema(nuevo, { intro: t('chat.fotoEs', { cosa: nombreClase(r.clase).toLowerCase(), p: Math.round(r.certeza * 100) }) });
      window.__ultimoChat = { foto: true, clase: r.clase, tema: nuevo.id };
      return;
    }
  }
  const quiza = r && r.clase !== 'otro' && r.confianza > 0.3 ? ` ${t('lente.quiza', { cosa: nombreClase(r.clase).toLowerCase() })}` : '';
  agregar(h(`<article class="msg fray nose"><p>${esc(t(motivo) + quiza)}</p></article>`));
  window.__ultimoChat = { foto: true, clase: r?.clase || null, tema: null };
}

export async function entrarChat({ enfocar = true, conTema = false } = {}) {
  if (!iniciado) { iniciado = true; bienvenida(); }
  if (pendiente && !conTema) {
    const p = pendiente; pendiente = null; ofrecidos.add(p.tema.id);
    await abrirConTema(p.tema, { intro: p.intro });
    enfocar = false;
  }
  pintarVencido();
  if (!fray.listo() && !fray.vencido() && E.guiones) {
    const estado = $('#chat-estado');
    estado.hidden = false;
    estado.textContent = t('chat.despertando');
    // El motor indexa en segundo plano; se puede preguntar ya (la seguridad responde al instante)
    fray.cargar({ alAvance: (a) => { if (a?.total) estado.textContent = `${t('chat.despertando')} ${Math.round((100 * a.hechos) / a.total)} %`; } })
      .catch((e) => console.error(e)).finally(() => { estado.hidden = true; });
  }
  if (enfocar) setTimeout(() => $('#chat-in').focus({ preventScroll: true }), 50);
}

// Contenido vencido (contrato §7): aviso con «Renovar» (solo con señal). El carril de seguridad sigue respondiendo.
function pintarVencido() {
  let box = $('#chat-vencido');
  if (!fray.vencido()) { box?.remove(); return; }
  if (box) return;
  box = h(`<div id="chat-vencido" class="msg fray nose chat-vencido" role="status"><p>${esc(t('chat.vencido'))}</p><button class="btn btn-flor btn-mini" type="button">${esc(t('chat.renovar'))}</button><p class="msg-nota"></p></div>`);
  $('#chat-log').prepend(box);
  box.querySelector('button').onclick = async () => {
    const nota = box.querySelector('.msg-nota');
    nota.textContent = t('chat.renovando');
    document.dispatchEvent(new CustomEvent('paramo-renovar', { detail: { alTerminar: (ok) => { nota.textContent = ok ? '' : t('chat.sinRed'); if (ok) box.remove(); } } }));
  };
}

export function retraducirChat() {
  ponerTema(tema);
  const log = $('#chat-log');
  if (log) { log.innerHTML = ''; iniciado = false; if (!$('#v-chat').hidden) { iniciado = true; bienvenida(); } }
}

function bienvenida() {
  const log = $('#chat-log');
  log.innerHTML = '';
  agregar(h(`<article class="msg fray bienvenida"><p>${esc(t('chat.hola'))}</p><p class="msg-nota">${esc(t('chat.reglas'))}</p></article>`));
  const hist = leerHistorial();
  for (const m of hist) {
    log.appendChild(h(`<div class="msg yo"><p>${esc(m.q)}</p></div>`));
    log.appendChild(tarjeta(m.r, { pregunta: m.q, ia: m.ia }));
  }
  if (hist.length) requestAnimationFrame(() => log.lastElementChild?.scrollIntoView({ block: 'end' }));
  else pintarSugerencias();
}

// Historial del chat: sobrevive si la app se cierra o el sistema la saca de memoria. Lleva texto de los guiones, así que
// vence con el contenido (24 h, contrato §7): si la vigencia venció no se muestra y se borra.
const LS_HIST = 'fray-chat-historial', MAX_HIST = 40;
function leerHistorial() {
  try {
    if (fray.vencido()) { localStorage.removeItem(LS_HIST); return []; }
    const x = JSON.parse(localStorage.getItem(LS_HIST) || '[]');
    return Array.isArray(x) ? x.filter((m) => m && m.q && m.r) : [];
  } catch { return []; }
}
function guardarHistorial(m) {
  try { localStorage.setItem(LS_HIST, JSON.stringify([...leerHistorial(), m].slice(-MAX_HIST))); } catch { /* sin almacenamiento */ }
}
export function borrarHistorial() { try { localStorage.removeItem(LS_HIST); } catch { /* */ } }

function pintarSugerencias() {
  const box = $('#chat-sug');
  box.innerHTML = '';
  for (const s of fray.sugerencias()) {
    const b = h(`<button class="chip">${esc(s)}</button>`);
    b.onclick = () => enviar(s);
    box.appendChild(b);
  }
  box.hidden = !box.children.length;
}

function agregar(el) {
  const log = $('#chat-log');
  log.appendChild(el);
  animar(el, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  requestAnimationFrame(() => el.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  return el;
}

// Cita visible: «Fuente: Guion … , p. N»
function citaTxt(c) {
  const f = fray.fuentes()[c.guion];
  return citar({ titulo: c.titulo || f?.titulo || c.guion }, c.pagina);
}

const ICONO_ESCUCHAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path class="onda" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>';

// Burbuja de Fray con la respuesta del motor (contrato §2). Mismo estilo que las fichas del álbum original.
function tarjeta(r, { pregunta = '', ia = null } = {}) {
  const lang = E.lang;
  const seg = r.tipo === 'seguridad';
  const card = h(`<article class="msg fray ${r.tipo === 'abstencion' || r.tipo === 'vencido' ? 'nose' : 'ficha'}${seg ? ' urgente' : ''}" lang="es"></article>`);
  if (seg) card.appendChild(h(`<p class="ficha-tema ficha-seguridad">${esc(t('chat.seguridad'))}</p>`));
  if (r.tipoContenido === 'relato') card.appendChild(h(`<p class="ficha-tema ficha-relato">${esc(t('chat.relato'))}</p>`));
  if (r.tipo === 'conflicto' && (r.fichas || []).length >= 2) {
    card.appendChild(h(`<p class="ficha-tema">${esc(r.aviso || t('chat.difieren'))}</p>`));
    for (const id of r.fichas) {
      const f = fray.fichaPorId(id);
      if (!f) continue;
      card.appendChild(h(`<div class="ficha-version"><p class="ficha-txt">${esc(f.breve)}</p>${(f.citas || []).map((c) => `<p class="ficha-fuente">${esc(citaTxt(c))}</p>`).join('')}</div>`));
    }
    if (r.ampliar) card.appendChild(h(`<p class="msg-nota">${esc(r.ampliar)}</p>`));
    return card;
  }
  const txt = r.tipo === 'vencido' ? t('chat.vencidoResp') : (r.breve || (r.tipo === 'abstencion' ? t('chat.nose') : ''));
  const p = h(`<p class="ficha-txt">${esc(txt)}</p>`);
  card.appendChild(p);
  if (r.tipo === 'abstencion') card.appendChild(h(`<p class="msg-nota">${esc(t('chat.abstencion'))}</p>`));
  let ampliado = null;
  if (r.ampliar && r.ampliar !== r.breve && r.tipo !== 'charla') { ampliado = h(`<p class="ficha-ampliado" hidden>${esc(r.ampliar)}</p>`); card.appendChild(ampliado); }
  // Texto del guion (si lo redactó la IA) y fuente: a un toque, no encima de la respuesta
  let delGuion = null, fuente = null;
  if (ia) {
    p.textContent = ia;
    card.appendChild(h(`<p class="marca-ia">${esc(t('chat.ia'))}</p>`));
    delGuion = h(`<p class="ficha-original" hidden><b>${esc(t('chat.delGuion'))}</b> ${esc(txt)}</p>`); card.appendChild(delGuion);
  }
  if ((r.citas || []).length) {
    // Cita corta siempre visible (el jurado verifica «respuesta + página citada»); el detalle completo, a un toque
    const c0 = r.citas[0], otras = r.citas.length - 1;
    card.appendChild(h(`<p class="ficha-cita-corta">📖 ${esc(fray.fuentes()[c0.guion]?.titulo || c0.guion)} · p. ${esc(String(c0.pagina))}${otras > 0 ? ` (+${otras})` : ''}</p>`));
    fuente = h(`<div class="ficha-fuentes" hidden>${r.citas.map((c) => `<p class="ficha-fuente">${esc(citaTxt(c))}</p>`).join('')}</div>`);
    card.appendChild(fuente);
  }
  const acc = h('<div class="ficha-acc"></div>');
  const alternar = (el, b, a, z) => () => { el.hidden = !el.hidden; b.textContent = el.hidden ? a : z; b.setAttribute('aria-expanded', String(!el.hidden)); };
  const be = h(`<button class="btn-cuadro btn-linea btn-mini-cuadro" aria-label="${esc(t('det.escuchar'))}">${ICONO_ESCUCHAR}</button>`);
  be.onclick = () => escuchar({ texto: ampliado && !ampliado.hidden ? ampliado.textContent : p.textContent, lang: 'es' });
  if (txt) acc.appendChild(be);
  if (ampliado) {
    const b = h(`<button class="chip chip-mini" type="button" aria-expanded="false">${esc(t('chat.ampliar'))}</button>`);
    b.onclick = alternar(ampliado, b, t('chat.ampliar'), t('chat.menos'));
    acc.appendChild(b);
  }
  if (fuente) {
    const b = h(`<button class="chip chip-mini" type="button" aria-expanded="false">${esc(t('chat.verFuente'))}</button>`);
    b.onclick = alternar(fuente, b, t('chat.verFuente'), t('chat.ocultarFuente'));
    acc.appendChild(b);
  }
  if (delGuion) {
    const b = h(`<button class="chip chip-mini" type="button" aria-expanded="false">${esc(t('chat.verGuion'))}</button>`);
    b.onclick = alternar(delGuion, b, t('chat.verGuion'), t('chat.ocultarGuion'));
    acc.appendChild(b);
  }
  // Duda: alternativas; charla: sugerencias para seguir (las dos preguntan a Fray con un toque)
  const opciones = r.tipo === 'duda' ? (r.alternativas || []).map((a) => a.titulo) : r.tipo === 'charla' ? (r.sugerencias || []).map((x) => (typeof x === 'string' ? x : x?.texto || x?.pregunta || x?.titulo)) : [];
  if (r.tipo === 'duda' && !r.breve) p.textContent = t('chat.teRefieres');
  for (const q of opciones.filter(Boolean)) {
    const b = h(`<button class="chip chip-mini" type="button">${esc(q)}</button>`);
    b.onclick = () => enviar(q);
    acc.appendChild(b);
  }
  if (acc.children.length) card.appendChild(acc);
  if (seg) vibrar([60, 40, 60]);
  return card;
}

async function enviar(texto) {
  $('#chat-sug').hidden = true; // las sugerencias solo ayudan a empezar
  agregar(h(`<div class="msg yo"><p>${esc(texto)}</p></div>`));
  // «Pensando»: Fray con puntos y una frase que cambia; una sola respuesta al final (sin reemplazar texto a la vista)
  const pensando = agregar(h(`<div class="msg fray pensando" role="status" aria-live="polite"><span class="pens-puntos"><span></span><span></span><span></span></span><span class="pens-txt">${esc(t('chat.pensando1'))}</span></div>`));
  const frases = [t('chat.pensando2'), t('chat.pensando3')];
  const relevo = setInterval(() => { const e = $('.pens-txt', pensando); if (e && frases.length) e.textContent = frases.shift(); }, 1400);
  const t0 = performance.now();
  // El tema (cromo o Lente) ayuda a la búsqueda: «¿cuántos años vive?» hablando del frailejón
  const consulta = tema && texto.split(/\s+/).length <= 6 ? `${texto} (${tema.es})` : texto;
  let r, ia = null;
  try { r = await fray.preguntar(consulta); } catch (e) { console.error(e); r = { tipo: 'abstencion', breve: t('chat.nose'), citas: [] }; }
  // IA local: redacta la respuesta del guion; solo se usa si pasa el verificador y llega antes del tope (si no, el guion)
  if (r.tipo === 'respuesta') ia = await fray.reescribir(r, texto, { timeoutMs: Math.max(1500, TOPE_MS - (performance.now() - t0)) });
  const espera = 350 - (performance.now() - t0);
  if (espera > 0) await new Promise((ok) => setTimeout(ok, espera)); // que el "pensando" no parpadee
  clearInterval(relevo);
  pensando.remove();
  pintarVencido();
  agregar(tarjeta(r, { pregunta: texto, ia }));
  guardarHistorial({ q: texto, r, ia });
  // Cola para la base (contrato §5.2): sin datos personales, solo texto, estación y día
  if (r.tipo === 'abstencion') sync.registrarSinRespuesta(texto, fray.estacionActual()).catch(() => {});
  document.dispatchEvent(new CustomEvent('fray:respuesta', { detail: { texto, tipo: r.tipo, fichas: r.fichas || [], estacion: fray.estacionActual() } }));
  window.__ultimoChat = { texto, tipo: r.tipo, fichas: r.fichas || [], citas: r.citas || [], tema: tema?.id || null, ia: !!ia };
}

// ======================================================================================================
// Hablarle a Fray: dictado sin red (spec hablarle-a-fray, issue #38)
// - Mantener presionado el micrófono graba; al soltar, la transcripción queda en la casilla, editable, sin enviarse.
const IDIOMAS_DICTADO = { es: ['es-CO', 'es-ES'], en: ['en-US', 'en-GB'] };

async function reconocimientoLocal(lang) {
  const API = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!API?.available || !('processLocally' in API.prototype)) return null;
  for (const idioma of IDIOMAS_DICTADO[lang] || []) {
    try {
      if (await API.available({ langs: [idioma], processLocally: true }) === 'available') {
        const reconocimiento = new API();
        reconocimiento.lang = idioma;
        reconocimiento.processLocally = true;
        return reconocimiento;
      }
    } catch { return null; }
  }
  return null;
}

export async function dictadoListo(lang = E.lang) {
  return !!(await reconocimientoLocal(lang));
}

function iniciarDictado() {
  // Mantener presionado «Enviar» = hablar; tocarlo = enviar (issue #38). Sin un botón aparte: la casilla queda ancha.
  const b = $('#chat-enviar'), entrada = $('#chat-in');
  const ESPERA = 350; // ms presionado para que cuente como «mantener»
  let sesion = null, pendiente = null, reloj = null, ignorarClick = false;
  const marcar = (on) => {
    b.classList.toggle('grabando', on);
    b.textContent = t(on ? 'dic.escucho' : 'chat.enviar');
    b.setAttribute('aria-pressed', String(on));
  };
  const completar = (texto) => {
    if (!texto) { aviso(t('dic.nada'), 3000); return; }
    // Editable antes de enviar: con viento y jerga, el reconocimiento se equivoca
    const previo = entrada.value.trim(); // lo que ya estaba escrito no se pierde: lo dictado va al final
    entrada.value = previo ? `${previo} ${texto}` : texto;
    entrada.focus(); entrada.setSelectionRange(entrada.value.length, entrada.value.length);
    // Sin aviso encima (taparía el texto): se resalta la casilla para que lo revise antes de enviar
    entrada.classList.remove('dictado'); void entrada.offsetWidth; entrada.classList.add('dictado');
    setTimeout(() => entrada.classList.remove('dictado'), 1800);
  };
  const parar = () => {
    pendiente = null;
    if (sesion) {
      try { sesion.stop(); } catch { sesion.abort(); }
    }
  };
  const empezar = async () => {
    if (sesion || pendiente) return;
    const intento = {};
    pendiente = intento;
    const reconocimiento = await reconocimientoLocal(E.lang);
    if (pendiente !== intento) return;
    pendiente = null;
    if (!reconocimiento) { aviso(t('dic.activar'), 5000); return; }

    let texto = '', fallo = false;
    sesion = reconocimiento;
    reconocimiento.onstart = () => { marcar(true); vibrar(20); };
    reconocimiento.onresult = (evento) => {
      texto = Array.from(evento.results).filter((r) => r.isFinal)
        .map((r) => r[0].transcript.trim()).join(' ').trim();
    };
    reconocimiento.onerror = ({ error }) => {
      fallo = true;
      const clave = { 'not-allowed': 'dic.sinPermiso', 'audio-capture': 'dic.sinMic', 'no-speech': 'dic.nada' }[error];
      aviso(t(clave || 'dic.error'), 4500);
    };
    reconocimiento.onend = () => {
      sesion = null;
      marcar(false);
      if (!fallo) completar(texto);
    };
    try { reconocimiento.start(); }
    catch { sesion = null; aviso(t('dic.error'), 4000); }
  };
  b.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    try { b.setPointerCapture(e.pointerId); } catch (er) { /* puntero sintético */ }
    clearTimeout(reloj);
    reloj = setTimeout(() => { reloj = null; ignorarClick = true; empezar(); }, ESPERA);
  });
  const soltar = () => {
    if (reloj) { clearTimeout(reloj); reloj = null; return; } // toque corto: se envía con el click normal
    parar();
  };
  b.addEventListener('pointerup', soltar);
  b.addEventListener('pointercancel', soltar);
  // Al soltar después de hablar no se envía nada: el texto queda para revisarlo
  b.addEventListener('click', (e) => {
    if (ignorarClick) { e.preventDefault(); e.stopImmediatePropagation(); ignorarClick = false; return; }
    if (!entrada.value.trim()) { e.preventDefault(); if (e.detail > 0) aviso(t('dic.pista'), 3500); }
  }, true);
  b.addEventListener('contextmenu', (e) => e.preventDefault()); // Android abre el menú al mantener presionado
  // Con teclado: Enter o Espacio sobre «Enviar» con la casilla vacía empieza y termina el dictado
  b.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && (sesion || pendiente || !entrada.value.trim())) {
      e.preventDefault();
      if (e.repeat) return;
      if (sesion || pendiente) parar(); else empezar();
    }
  });
}
