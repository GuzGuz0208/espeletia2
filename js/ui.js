// Pantalla del visitante: inicio (elegir estación o escanear QR) → chat de la estación.
// El contenido (estaciones, fichas, citas) sale SIEMPRE del paquete; aquí solo hay textos de interfaz.
// Contrato con el motor: docs/contrato.md §2-§4.

import { fray as cargarFray, generador as cargarGenerador, info, claveQR } from './ui-motor.js';
import { cargarPaquete, alCambiar, avisarCambio } from './ui-paquete.js';
import { arrancarSync, sync } from './ui-sync.js';
import { verificarQR } from './qr-estacion.js';
import { t, setIdioma, traducirDOM, getIdioma } from './ui-i18n.js';
import * as vig from './vigencia.js';
import { carril } from './carril.js';
import { fray as dibujoFray, iconos } from './ui-art.js';

const $ = (s) => document.querySelector(s);

// Gancho para los cromos (rama eduardo/cromos): id del cromo que se gana en cada estación.
const CROMO_DE_ESTACION = {
  brisas: 'brisas-agua',
  aguacerales: 'aguacerales-frailejon',
  arenales: 'arenales-dunas',
  lunares: 'lunares-gelifraccion',
  tumbas: 'tumbas-nombre',
};

const E = {
  paquete: null,
  origen: null,
  motor: null,        // módulo fray (real o de ejemplo)
  listo: false,       // el motor ya indexó el paquete
  gen: null,          // módulo generador
  genListo: false,
  estacion: null,     // id de la estación abierta
  cromosDados: new Set(),
  vencido: false,     // venció la vigencia del contenido (contrato §7)
};

// ---------- Ajustes (letra, contraste, idioma) ----------
const AJUSTES = 'fray.ajustes';
function leerAjustes() {
  try { return { letra: '1', contraste: false, idioma: 'es', ...JSON.parse(localStorage.getItem(AJUSTES) || '{}') }; } catch { return { letra: '1', contraste: false, idioma: 'es' }; }
}
function aplicarAjustes(a) {
  document.documentElement.dataset.letra = a.letra;
  document.documentElement.dataset.contraste = a.contraste ? 'alto' : 'normal';
  setIdioma(a.idioma);
  traducirDOM();
  $('#opc-contraste').checked = a.contraste;
  document.querySelectorAll('#opc-letra button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.letra === a.letra));
  document.querySelectorAll('#opc-idioma button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.idioma === a.idioma));
}
function guardarAjustes(cambio) {
  const a = { ...leerAjustes(), ...cambio };
  try { localStorage.setItem(AJUSTES, JSON.stringify(a)); } catch { /* sin almacenamiento */ }
  aplicarAjustes(a);
  pintarEstado();
  pintarVigencia();
  if (E.vencido) pintarVencido();
  else if (E.estacion && !enAlbum()) abrirEstacion(E.estacion, { conservar: true });
}

// ---------- Utilidades de contenido ----------
const estacionPorId = (id) => E.paquete?.estaciones?.find((s) => s.id === id);
const fichaPorId = (id) => E.paquete?.fichas?.find((f) => f.id === id);
const usable = (f) => !f.bloqueada && f.estado !== 'borrador';

function textoAltitud(est) {
  if (!est?.altitud?.m) return '';
  return `${est.altitud.m.toLocaleString('es-CO')} m s. n. m.`;
}

function citasDeFicha(f) {
  return (f.citas || []).map((c) => ({ ...c, titulo: E.paquete?.fuentes?.[c.guion]?.titulo || c.guion }));
}

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = texto;
  return n;
}

function chipCita(c) {
  const s = el('span', 'cita');
  s.innerHTML = iconos.libro;
  s.append(` ${c.titulo || c.guion} · p. ${c.pagina}`);
  return s;
}

function darCromo(estacion) {
  const id = CROMO_DE_ESTACION[estacion];
  if (!id || E.cromosDados.has(id)) return;
  E.cromosDados.add(id);
  document.dispatchEvent(new CustomEvent('fray:cromo', { detail: { id } }));
}

// ---------- Navegación ----------
// Vistas del Álbum del Páramo (js/album-app.js): se pintan allá al recibir 'fray:vista'
const VISTAS_ALBUM = ['album', 'mapa', 'guia'];
const emitir = (tipo, detail) => {
  if (tipo === 'fray:paquete') window.frayPaquete = detail.paquete; // por si el álbum aún no escucha
  document.dispatchEvent(new CustomEvent(tipo, { detail }));
};

function mostrar(vista) {
  for (const v of ['inicio', 'qr', 'chat', 'vencido', ...VISTAS_ALBUM]) { const n = $(`#vista-${v}`); if (n) n.hidden = v !== vista; }
  $('#form-pregunta').hidden = vista !== 'chat' && vista !== 'vencido';
  $('#btn-volver').hidden = vista === 'inicio' || vista === 'vencido';
  document.body.dataset.vista = vista;
  pintarVigencia();
  if (vista !== 'qr') pararCamara();
  window.scrollTo(0, 0);
}

function rutaActual() {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  // El álbum se puede ver también con el contenido vencido (los cromos quedan sin el dato del guion)
  if (VISTAS_ALBUM.includes(id)) { $('#barra-titulo').textContent = ''; mostrar(id); emitir('fray:vista', { vista: id }); return; }
  if (E.vencido) return pintarVencido();
  if (id === 'qr') return mostrar('qr'), iniciarCamara();
  if (id && estacionPorId(id)) return abrirEstacion(id);
  E.estacion = null;
  $('#barra-titulo').textContent = '';
  mostrar('inicio');
}

// ---------- Inicio ----------
function pintarEstaciones() {
  const ol = $('#lista-estaciones');
  ol.replaceChildren();
  const ests = [...(E.paquete?.estaciones || [])].sort((a, b) => a.orden - b.orden);
  for (const s of ests) {
    const li = el('li');
    const a = el('a', 'estacion');
    a.href = `#/${encodeURIComponent(s.id)}`;
    a.append(el('span', 'estacion-num', s.orden === 0 ? 'i' : String(s.orden)));
    const txt = el('span', 'estacion-txt');
    txt.append(el('b', null, s.nombre));
    txt.append(el('small', null, [s.orden === 0 ? t('inicio.introduccion') : '', textoAltitud(s)].filter(Boolean).join(' · ')));
    a.append(txt);
    li.append(a);
    ol.append(li);
  }
}

function pintarEstado() {
  const ins = $('#insignia-ejemplo');
  const marcas = [];
  if (info.motor === 'ejemplo') marcas.push(t('estado.ejemplo'));
  if (E.paquete?.ejemplo) marcas.push(t('estado.paqueteEjemplo'));
  ins.hidden = !marcas.length;
  ins.textContent = marcas.join(' · ');
  ins.title = info.errores.join('\n');
  $('#estado-carga').hidden = E.listo;
}

// ---------- Avisos del día (contrato §6): tal cual, con su hora y quién lo emite ----------
const hora = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
async function pintarAvisos() {
  const caja = $('#avisos');
  if (!E.estacion) { caja.hidden = true; return; }
  let avisos = [];
  try { avisos = await sync.avisosVigentes({ estacion: E.estacion }); } catch { /* sin almacenamiento */ }
  caja.replaceChildren();
  for (const a of avisos) {
    const d = el('div', 'aviso');
    d.append(el('p', 'aviso-texto', a.texto));
    d.append(el('p', 'aviso-pie', `${a.emitidoPor} · ${hora(a.vigenteDesde)}–${hora(a.vigenteHasta)}`));
    caja.append(d);
  }
  caja.hidden = !avisos.length;
}

// ---------- Chat ----------
function sugerenciasDe(estacion) {
  const fs = E.paquete.fichas.filter((f) => usable(f) && f.preguntas?.length);
  const propias = fs.filter((f) => f.estacion === estacion);
  const generales = fs.filter((f) => !f.estacion);
  // Primera letra en mayúscula (también después de «¿»), solo para mostrar
  const bonita = (q) => q.replace(/^(¿?\s*)(\p{L})/u, (_, a, b) => a + b.toUpperCase());
  return [...new Set([...propias, ...generales].map((f) => bonita(f.preguntas[0])))].slice(0, 4);
}

function abrirEstacion(id, { conservar = false } = {}) {
  const est = estacionPorId(id);
  if (!est) return;
  const cambio = E.estacion !== id;
  E.estacion = id;
  $('#barra-titulo').textContent = est.nombre;
  $('#chat-estacion').textContent = est.nombre;
  $('#chat-altitud').textContent = textoAltitud(est);
  $('#chat-hola').textContent = t('chat.hola', { estacion: est.nombre });
  const chips = $('#chips-sug');
  chips.replaceChildren();
  for (const q of sugerenciasDe(id)) {
    const b = el('button', 'chip', q);
    b.type = 'button';
    b.onclick = () => preguntar(q);
    chips.append(b);
  }
  $('#sugerencias').hidden = !chips.children.length;
  if (cambio && !conservar) $('#conversacion').replaceChildren();
  pintarAvisos();
  mostrar('chat');
}

async function preguntar(texto) {
  texto = texto.trim();
  if (!texto) return;
  const conv = E.vencido ? $('#conv-vencido') : $('#conversacion');
  conv.append(el('p', 'burbuja-visitante', texto));
  const tarjeta = el('article', 'resp resp-cargando');
  tarjeta.append(el('p', 'resp-texto', t('chat.pensando')));
  conv.append(tarjeta);
  tarjeta.scrollIntoView({ behavior: 'smooth', block: 'end' });

  let r;
  // Vigencia vencida: solo el carril de seguridad (remite al guía, sin contenido del parque)
  if (E.vencido || vig.verificarVigencia().estado === 'vencido') {
    pintarRespuesta(tarjeta, carril(texto) || { tipo: 'vencido', breve: t('vencido.respuesta'), citas: [] });
    return;
  }
  try {
    const motor = E.motor || (await E.motorP);
    r = await motor.preguntar(texto, { estacion: E.estacion });
    if (r?.tipo === 'vencido') { pintarRespuesta(tarjeta, { ...r, breve: t('vencido.respuesta') }); alVencer(); return; }
  } catch (e) {
    console.error(e);
    tarjeta.className = 'resp resp-abstencion';
    tarjeta.replaceChildren(el('p', 'resp-texto', t('chat.error')));
    return;
  }
  pintarRespuesta(tarjeta, r);
  tarjeta.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Cola para la base (contrato §5.2): sin datos personales, solo texto, estación y día
  if (r.tipo === 'abstencion') sync.registrarSinRespuesta(texto, E.estacion).catch(() => {});
  if (r.tipo === 'respuesta') {
    darCromo(E.estacion);
    emitir('fray:respuesta', { estacion: E.estacion, fichas: r.fichas || [] });
    if (E.genListo) mejorarConIA(tarjeta, r, texto);
  }
}

function pintarRespuesta(tarjeta, r) {
  tarjeta.className = `resp resp-${r.tipo}`;
  tarjeta.replaceChildren();

  if (r.tipo === 'seguridad') {
    const cab = el('p', 'resp-cab cab-seguridad');
    cab.innerHTML = iconos.alerta;
    cab.append(el('span', null, t('chat.seguridad')));
    tarjeta.append(cab);
  }
  if (r.tipoContenido === 'relato') tarjeta.append(el('p', 'etiqueta etiqueta-relato', t('chat.relato')));

  if (r.tipo === 'conflicto') {
    const cab = el('p', 'resp-cab cab-conflicto');
    cab.innerHTML = iconos.libro;
    cab.append(el('span', null, r.aviso || t('chat.difieren')));
    tarjeta.append(cab);
    const fs = (r.fichas || []).map(fichaPorId).filter(Boolean);
    if (fs.length >= 2) {
      for (const f of fs) {
        const v = el('div', 'version');
        v.append(el('p', 'version-titulo', f.titulo));
        v.append(el('p', 'resp-texto', f.breve));
        const cs = el('div', 'citas');
        citasDeFicha(f).forEach((c) => cs.append(chipCita(c)));
        v.append(cs);
        tarjeta.append(v);
      }
      if (r.ampliar) tarjeta.append(el('p', 'nota', r.ampliar));
      agregarEscuchar(tarjeta, fs.map((f) => f.breve).join('. '));
      return;
    }
  }

  const p = el('p', 'resp-texto', r.breve);
  tarjeta.append(p);
  const marca = el('p', 'marca-ia', t('chat.ia'));
  marca.hidden = true;
  tarjeta.append(marca);

  if (r.tipo === 'abstencion') tarjeta.append(el('p', 'nota', t('chat.abstencion')));

  if (r.tipo === 'duda' && r.alternativas?.length) {
    if (!r.breve) tarjeta.append(el('p', 'nota', t('chat.duda')));
    const alts = el('div', 'chips');
    for (const a of r.alternativas) {
      const b = el('button', 'chip', a.titulo);
      b.type = 'button';
      b.onclick = () => preguntar(a.titulo);
      alts.append(b);
    }
    tarjeta.append(alts);
  }

  let caja = null;
  if (r.ampliar && r.ampliar !== r.breve) {
    caja = el('div', 'ampliado', r.ampliar);
    caja.hidden = true;
    tarjeta.append(caja);
  }

  if (r.citas?.length) {
    const cs = el('div', 'citas');
    r.citas.forEach((c) => cs.append(chipCita(c)));
    tarjeta.append(cs);
  }

  const acc = el('div', 'acciones');
  if (caja) {
    const b = el('button', 'btn btn-linea', t('chat.ampliar'));
    b.type = 'button';
    b.setAttribute('aria-expanded', 'false');
    b.onclick = () => {
      caja.hidden = !caja.hidden;
      b.textContent = caja.hidden ? t('chat.ampliar') : t('chat.menos');
      b.setAttribute('aria-expanded', String(!caja.hidden));
    };
    acc.append(b);
  }
  tarjeta.append(acc);
  agregarEscuchar(tarjeta, () => (caja && !caja.hidden ? caja.textContent : p.textContent));
}

// Si hay un modelo local listo, intenta reescribir la respuesta. El texto del guion ya está en pantalla;
// solo se reemplaza si la reescritura pasa el verificador (ok === true). La cita nunca se quita.
async function mejorarConIA(tarjeta, r, pregunta) {
  try {
    const out = await E.gen.reescribir(r, pregunta, { timeoutMs: 6000 });
    if (!out?.ok || !out.texto || !tarjeta.isConnected) return;
    tarjeta.querySelector('.resp-texto').textContent = out.texto;
    tarjeta.querySelector('.marca-ia').hidden = false;
  } catch (e) { console.warn('Generador:', e); }
}

// ---------- Voz (solo voces locales del dispositivo, sin red) ----------
function vozLocal() {
  if (!('speechSynthesis' in window)) return null;
  const voces = speechSynthesis.getVoices().filter((v) => v.localService && v.lang?.toLowerCase().startsWith('es'));
  return voces.find((v) => /co|419|mx|us/i.test(v.lang)) || voces[0] || null;
}

function agregarEscuchar(tarjeta, texto) {
  const voz = vozLocal();
  if (!voz) return;
  let acc = tarjeta.querySelector('.acciones');
  if (!acc) { acc = el('div', 'acciones'); tarjeta.append(acc); }
  const b = el('button', 'btn btn-linea');
  b.type = 'button';
  const pintar = (hablando) => { b.innerHTML = iconos.escuchar; b.append(` ${hablando ? t('chat.callar') : t('chat.escuchar')}`); };
  pintar(false);
  b.onclick = () => {
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); pintar(false); return; }
    const u = new SpeechSynthesisUtterance(typeof texto === 'function' ? texto() : texto);
    u.voice = voz; u.lang = voz.lang; u.rate = 0.95;
    u.onend = u.onerror = () => pintar(false);
    speechSynthesis.speak(u);
    pintar(true);
  };
  acc.append(b);
}

// ---------- QR de estación ----------
let flujo = null;
let bucle = null;
let detector = null;
let ultimoAjeno = '';

async function iniciarCamara() {
  const msg = $('#qr-mensaje');
  msg.textContent = '';
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch {
    msg.textContent = t('qr.sinCamara');
    return;
  }
  const v = $('#video');
  v.srcObject = flujo;
  await v.play().catch(() => {});
  if ('BarcodeDetector' in window) {
    try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; }
  }
  bucle = setInterval(leerFotograma, 300);
}

function pararCamara() {
  clearInterval(bucle); bucle = null;
  flujo?.getTracks().forEach((tr) => tr.stop());
  flujo = null;
}

let leyendo = false;
async function leerFotograma() {
  const v = $('#video');
  if (leyendo || !v.videoWidth) return;
  leyendo = true;
  try {
    let valor = null;
    if (detector) {
      valor = (await detector.detect(v))[0]?.rawValue || null;
    } else if (window.jsQR) {
      const escala = Math.min(1, 640 / v.videoWidth);
      const cv = document.createElement('canvas');
      cv.width = Math.round(v.videoWidth * escala); cv.height = Math.round(v.videoHeight * escala);
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(v, 0, 0, cv.width, cv.height);
      const d = ctx.getImageData(0, 0, cv.width, cv.height);
      valor = window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' })?.data || null;
    }
    if (!valor) return;
    // QR del modo guía (js/album-guia.js): lo verifica el álbum
    if (valor.startsWith('FRAYG1|')) { pararCamara(); navigator.vibrate?.(40); emitir('fray:qr-guia', { texto: valor }); return; }
    const v = await verificarQR(valor, await claveQR(E.paquete), E.paquete.estaciones.map((s) => s.id));
    const id = v.ok ? v.estacion : null;
    if (id && estacionPorId(id)) {
      pararCamara();
      navigator.vibrate?.(40);
      darCromo(id);
      location.hash = `#/${encodeURIComponent(id)}`;
    } else if (valor !== ultimoAjeno) {
      ultimoAjeno = valor;
      $('#qr-mensaje').textContent = t('qr.ajeno');
    }
  } catch (e) { console.warn(e); } finally { leyendo = false; }
}

// ---------- Arranque ----------
// El motor indexa en segundo plano. La pantalla y las preguntas no esperan: el motor real responde la seguridad
// al instante (carril crítico) y espera él mismo al índice para lo demás.
function prepararMotor() {
  E.listo = false;
  pintarEstado();
  E.motorP = cargarFray().then(async (m) => {
    E.motor = m;
    await m.cargar(E.paquete, { alAvance: avance });
    E.listo = true;
    pintarEstado();
    return m;
  });
  E.motorP.catch((e) => { console.error(e); $('#estado-carga').textContent = t('chat.error'); });
  return E.motorP;
}

function avance(a) {
  const txt = t('estado.preparando');
  $('#estado-carga').textContent = a?.total ? `${txt} ${Math.round((100 * a.hechos) / a.total)} %` : txt;
}

async function recargarPaquete() {
  if (E.vencido) return;
  const { paquete, origen, incluido } = await cargarPaquete();
  E.paquete = paquete;
  E.origen = origen;
  E.incluido = incluido;
  emitir('fray:paquete', { paquete });
  pintarEstaciones();
  prepararMotor();
  if (E.estacion && !enAlbum()) abrirEstacion(E.estacion, { conservar: true });
}
const enAlbum = () => VISTAS_ALBUM.includes(location.hash.replace(/^#\/?/, ''));

function conectarEventos() {
  $('#btn-volver').innerHTML = iconos.volver;
  $('#btn-ajustes').innerHTML = iconos.ajustes;
  $('#ico-qr').innerHTML = iconos.qr;
  $('#ico-enviar').innerHTML = iconos.enviar;
  $('#fray-inicio').innerHTML = dibujoFray(110);
  $('#fray-chat').innerHTML = dibujoFray(64);

  $('#btn-volver').onclick = () => { location.hash = ''; };
  $('#btn-qr').onclick = () => { location.hash = '#/qr'; };
  $('#btn-qr-cancelar').onclick = () => { location.hash = ''; };
  $('#btn-ajustes').onclick = () => $('#dlg-ajustes').showModal();
  document.querySelectorAll('#opc-letra button').forEach((b) => { b.onclick = () => guardarAjustes({ letra: b.dataset.letra }); });
  document.querySelectorAll('#opc-idioma button').forEach((b) => { b.onclick = () => guardarAjustes({ idioma: b.dataset.idioma }); });
  $('#opc-contraste').onchange = (e) => guardarAjustes({ contraste: e.target.checked });

  const ta = $('#pregunta');
  $('#form-pregunta').onsubmit = (e) => { e.preventDefault(); const q = ta.value; ta.value = ''; preguntar(q); };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#form-pregunta').requestSubmit(); } });

  window.addEventListener('hashchange', rutaActual);
  // «Preguntar a Fray» desde un cromo del álbum: abre el chat de la estación y hace la pregunta
  document.addEventListener('fray:preguntar', (e) => {
    const { estacion, texto } = e.detail || {};
    if (E.vencido || !estacionPorId(estacion)) return;
    if (location.hash !== `#/${encodeURIComponent(estacion)}`) location.hash = `#/${encodeURIComponent(estacion)}`;
    else abrirEstacion(estacion, { conservar: true });
    setTimeout(() => preguntar(texto), 50);
  });
  alCambiar(() => recargarPaquete().catch(manejarErrorCarga));
  $('#fray-vencido').innerHTML = dibujoFray(110);
  $('#btn-renovar').onclick = () => intentarRenovar();
  // Vigencia: se revisa cada 30 s, al volver a la app y al recuperar la señal
  setInterval(revisarVigencia, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarVigencia(); });
  window.addEventListener('online', () => { if (E.vencido) intentarRenovar(); });
  vig.alCambiar((e) => { if (e.estado === 'vencido') alVencer(); });
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};
}

// ---------- Vigencia del contenido (contrato §7) ----------
function pintarVigencia() {
  const p = $('#vigencia');
  if (!p) return;
  const e = vig.estadoVigencia();
  const vista = document.body.dataset.vista || 'inicio';
  if (E.vencido || e.estado !== 'vigente' || !e.venceEn || (vista !== 'inicio' && !e.pronto)) { p.hidden = true; return; }
  const { hora, manana } = vig.textoHora(e.venceEn, getIdioma());
  p.textContent = t(e.pronto ? 'vigencia.pronto' : manana ? 'vigencia.hastaManana' : 'vigencia.hasta', { hora });
  p.classList.toggle('vigencia-pronto', !!e.pronto);
  p.hidden = false;
}

function pintarVencido() {
  const r = (() => { try { return JSON.parse(localStorage.getItem('fray.vigencia') || 'null'); } catch { return null; } })();
  $('#vencido-titulo').textContent = t('vencido.titulo', { horas: r?.horas || vig.HORAS_DEFECTO });
  $('#barra-titulo').textContent = '';
  E.estacion = null;
  mostrar('vencido');
}

let venciendo = null;
function alVencer() {
  return (venciendo ??= (async () => {
    E.vencido = true;
    E.paquete = null;
    emitir('fray:paquete', { paquete: null });
    E.listo = false;
    try { E.motor?.descargar?.(); } catch { /* nada */ }
    $('#conversacion').replaceChildren();
    $('#lista-estaciones').replaceChildren();
    $('#avisos').replaceChildren();
    pintarVencido();
    await vig.borrarContenido();
    await intentarRenovar();
  })().finally(() => { venciendo = null; }));
}

let renovando = null;
function intentarRenovar() {
  return (renovando ??= (async () => {
    const msg = $('#vencido-estado');
    msg.textContent = t('vencido.renovando');
    const r = await vig.renovar();
    if (!r.ok) { msg.textContent = t('vencido.sinRed'); return false; }
    msg.textContent = '';
    E.vencido = false;
    $('#conv-vencido').replaceChildren();
    await recargarPaquete().catch(manejarErrorCarga);
    rutaActual();
    return true;
  })().finally(() => { renovando = null; }));
}

function revisarVigencia() {
  const e = vig.verificarVigencia();
  if (e.estado === 'vencido' && !E.vencido) alVencer();
  pintarVigencia();
}

function manejarErrorCarga(e) {
  if (e?.vencido) { alVencer(); return; }
  console.error(e);
  $('#estado-carga').textContent = t('chat.error');
}

async function iniciar() {
  aplicarAjustes(leerAjustes());
  conectarEventos();
  // Vigencia: si venció, borra y (con señal) renueva antes de cargar nada del parque
  const v = await vig.asegurarVigencia().catch(() => vig.estadoVigencia());
  if (v.estado === 'vencido') { E.vencido = true; pintarVencido(); $('#vencido-estado').textContent = t('vencido.sinRed'); }
  else await recargarPaquete().catch(manejarErrorCarga);
  // Sincronización con la base (contrato §5.5). Sin urlBase configurada no usa la red.
  arrancarSync({
    versionLocal: E.incluido?.version,
    alPaqueteNuevo: async (p) => {
      // Llegó un paquete firmado: si la vigencia había vencido, hay señal → se renueva (o se borra si no se pudo)
      if (E.vencido || vig.verificarVigencia().estado === 'vencido') {
        if (!(await intentarRenovar())) await vig.borrarContenido();
        return;
      }
      E.paquete = p;
      E.origen = 'sync';
      emitir('fray:paquete', { paquete: p });
      pintarEstaciones();
      avisarCambio(p.version);
      if (E.estacion && !enAlbum()) abrirEstacion(E.estacion, { conservar: true });
      prepararMotor(); // reindexa en segundo plano
    },
    alAvisos: () => pintarAvisos(),
  }).catch((e) => console.warn('Sync:', e));
  setInterval(pintarAvisos, 60000); // los avisos vencidos desaparecen solos
  rutaActual();
  pintarVigencia();
  try {
    E.gen = await cargarGenerador();
    E.genListo = !!(await E.gen.disponible())?.listo;
  } catch { E.genListo = false; }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW:', e));
}

iniciar();
