// js/vigencia.js · Vigencia del contenido del parque en el dispositivo (contrato §7, decisión 11).
//
// Requisito de la organización (UTON): el contenido del parque —paquete de fichas, índice/vectores, avisos y textos de las
// respuestas— se DESACTIVA 24 h después de activarse en el teléfono del visitante. No es DRM: es higiene de datos (que la
// información recopilada por años no se quede en los teléfonos).
//
// - Activación: la primera vez que se carga un paquete en el dispositivo (ui-paquete.js → cargarPaquete) se guarda
//   activadoEn y venceEn = activadoEn + vigenciaHoras (del paquete; por defecto 24).
// - Reloj: se guarda la última hora vista. Si el reloj retrocede más de 10 min (respecto a esa hora o a la activación), se
//   trata como vencido. Dentro de una sesión se usa además un reloj monótono (performance.now): cambiar la hora del
//   teléfono con la app abierta no alarga nada.
// - Al vencer: borrarContenido() borra paquetes (sync y Panel), vectores de fray, avisos, la lista local de preguntas sin
//   respuesta y las entradas de contenido/ y ejemplo/ en el caché del service worker. Conserva la app, el motor y el
//   modelo e5 (no son información del parque) y la cola aún no enviada a la base (preguntas de visitantes, sin contenido).
// - Renovar: solo con red. Se descarga de nuevo contenido/paquete.json con cache:'no-store'; el service worker no sirve
//   contenido/ desde caché mientras la vigencia esté vencida (lee el registro de IndexedDB 'fray-vigencia'). Sin red no
//   hay copia vieja de donde «renovar»: se borró, y el SW no la sirve.
// - Estados: 'sin-activar' | 'vigente' | 'vencido'. Una vez vencido solo renovar() lo saca de ahí.

import * as sync from './sync.js';

export const HORAS_DEFECTO = 24;
export const TOLERANCIA_RELOJ_MS = 10 * 60 * 1000;
export const AVISO_ANTES_MS = 60 * 60 * 1000;
const CLAVE = 'fray.vigencia';
const DB = 'fray-vigencia';
// Prefijos de ruta con información del parque (los mismos que sw.js trata como contenido)
export const RUTAS_CONTENIDO = /\/(contenido|ejemplo)\//;

// ---------------------------------------------------------------- dependencias (se reemplazan en las pruebas)

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function lsReal() {
  try { if (typeof window !== 'undefined' && window.localStorage) return window.localStorage; } catch { /* bloqueado */ }
  return null;
}

const dep = {
  ahora: () => Date.now(),
  mono: () => (globalThis.performance?.now ? performance.now() : Date.now()),
  ls: null,
  fetch: (...a) => globalThis.fetch(...a),
  enLinea: () => globalThis.navigator?.onLine !== false,
  urlPaquete: 'contenido/paquete.json',
};
let ls = null;
let base = null;          // { wall, mono } al empezar la sesión: reloj monótono
let anterior = null;      // último estado notificado
const oyentes = new Set();

/** Solo para pruebas: { ahora, mono, ls, fetch, enLinea, urlPaquete }. Reinicia el reloj de la sesión. */
export function configurar(d = {}) {
  Object.assign(dep, d);
  ls = d.ls || null;
  base = null;
  anterior = null;
}

function almacen() { return (ls ??= dep.ls || lsReal() || memoria()); }

function ahora() {
  const w = dep.ahora(), m = dep.mono();
  if (!base) base = { wall: w, mono: m };
  // Nunca menos que lo que ha corrido el reloj monótono desde que empezó la sesión
  return Math.max(w, base.wall + (m - base.mono));
}

function leer() {
  try { return JSON.parse(almacen().getItem(CLAVE) || 'null'); } catch { return null; }
}
function escribir(r) {
  try { almacen().setItem(CLAVE, JSON.stringify(r)); } catch { /* sin almacenamiento: queda en memoria del SW/IDB */ }
}

// ---------------------------------------------------------------- registro para el service worker (IndexedDB)

function abrirDB() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}
async function guardarRegistroSW(reg) {
  if (typeof indexedDB === 'undefined') return;
  try {
    const d = await abrirDB();
    await new Promise((ok) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(reg, 'estado'); t.oncomplete = ok; t.onerror = ok; });
    d.close();
  } catch { /* sin IndexedDB */ }
  try { globalThis.navigator?.serviceWorker?.controller?.postMessage({ tipo: 'vigencia', ...reg }); } catch { /* nada */ }
}
async function leerRegistroSW() {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const d = await abrirDB();
    const v = await new Promise((ok) => { const q = d.transaction('kv').objectStore('kv').get('estado'); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); });
    d.close();
    return v;
  } catch { return null; }
}

// ---------------------------------------------------------------- estado

function calcular(r, t) {
  if (!r?.activadoEn) return { estado: 'sin-activar', vigente: true, venceEn: null, restanteMs: null, activadoEn: null, motivo: null };
  let motivo = r.vencido ? (r.motivo || 'tiempo') : null;
  if (!motivo && t >= r.venceEn) motivo = 'tiempo';
  if (!motivo && (t < (r.ultimaVista || 0) - TOLERANCIA_RELOJ_MS || t < r.activadoEn - TOLERANCIA_RELOJ_MS)) motivo = 'reloj';
  const vencido = !!motivo;
  return {
    estado: vencido ? 'vencido' : 'vigente', vigente: !vencido, venceEn: r.venceEn,
    restanteMs: vencido ? 0 : r.venceEn - t, activadoEn: r.activadoEn, motivo,
    pronto: !vencido && r.venceEn - t <= AVISO_ANTES_MS,
  };
}

/** { estado, vigente, venceEn, restanteMs, activadoEn, motivo, pronto }. No escribe nada. */
export function estadoVigencia() {
  return calcular(leer(), ahora());
}

/** Comprueba la vigencia, guarda la última hora vista y, si acaba de vencer, lo deja registrado y avisa a los oyentes. */
export function verificarVigencia() {
  const r = leer();
  const t = ahora();
  const e = calcular(r, t);
  if (r?.activadoEn) {
    if (e.estado === 'vencido' && !r.vencido) {
      Object.assign(r, { vencido: true, motivo: e.motivo, vencidoEn: t });
      guardarRegistroSW({ venceEn: r.venceEn, vencido: true });
    }
    if (e.estado === 'vigente') r.ultimaVista = Math.max(r.ultimaVista || 0, t);
    escribir(r);
  }
  if (anterior && anterior !== e.estado) for (const fn of oyentes) { try { fn(e); } catch (err) { console.warn('[vigencia]', err); } }
  anterior = e.estado;
  return e;
}

/** Escucha los cambios de estado (p. ej. vigente → vencido con la app abierta). */
export function alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }

/** Activa la vigencia si es la primera carga de contenido en el dispositivo. No hace nada si ya está activa o vencida. */
export function activarSiPrimeraVez(horas) {
  if (leer()?.activadoEn) return verificarVigencia();
  return iniciarVigencia(horas);
}

function iniciarVigencia(horas) {
  const h = Number(horas) > 0 ? Number(horas) : HORAS_DEFECTO;
  const t = ahora();
  const r = { activadoEn: t, venceEn: t + h * 3600 * 1000, horas: h, ultimaVista: t, vencido: false };
  escribir(r);
  guardarRegistroSW({ venceEn: r.venceEn, vencido: false });
  anterior = 'vigente';
  return calcular(r, t);
}

// ---------------------------------------------------------------- borrado

// Vacía un almacén de IndexedDB sin borrar la base (deleteDatabase queda bloqueado si el worker tiene conexiones abiertas).
// Si la base no existe, no se crea.
function vaciarIDB(nombre, store) {
  if (typeof indexedDB === 'undefined') return Promise.resolve(false);
  return new Promise((ok) => {
    let req;
    try { req = indexedDB.open(nombre); } catch { ok(false); return; }
    req.onupgradeneeded = () => { try { req.transaction.abort(); } catch { /* nada */ } };
    req.onerror = () => ok(false);
    req.onsuccess = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(store)) { d.close(); ok(false); return; }
      const t = d.transaction(store, 'readwrite');
      t.objectStore(store).clear();
      t.oncomplete = () => { d.close(); ok(true); };
      t.onerror = t.onabort = () => { d.close(); ok(false); };
    };
  });
}

async function borrarCaches() {
  if (typeof caches === 'undefined') return 0;
  let n = 0;
  for (const k of await caches.keys()) {
    const c = await caches.open(k);
    for (const req of await c.keys()) {
      if (RUTAS_CONTENIDO.test(new URL(req.url).pathname)) { await c.delete(req); n++; }
    }
  }
  return n;
}

/** Borra del dispositivo todo el contenido del parque. Idempotente. Devuelve un resumen de lo borrado. */
export async function borrarContenido() {
  const res = { sync: false, panel: false, vectores: false, caches: 0, sinRespuesta: false };
  try { await sync.borrarContenido(); res.sync = true; } catch (e) { console.warn('[vigencia] sync', e); }
  res.panel = await vaciarIDB('fray-paquete', 'versiones');
  res.vectores = await vaciarIDB('fray-vectores', 'v');
  try { almacen().removeItem('fray.sinRespuesta'); res.sinRespuesta = true; } catch { /* nada */ }
  try { res.caches = await borrarCaches(); } catch (e) { console.warn('[vigencia] caches', e); }
  const r = leer();
  if (r?.activadoEn) await guardarRegistroSW({ venceEn: r.venceEn, vencido: true });
  return res;
}

// ---------------------------------------------------------------- renovar

/** Con red: vuelve a descargar el paquete y reinicia la vigencia. Sin red falla (no hay copia vieja que valga). */
export async function renovar() {
  if (!dep.enLinea()) return { ok: false, motivo: 'sin señal' };
  let paquete;
  try {
    const sep = dep.urlPaquete.includes('?') ? '&' : '?';
    const r = await dep.fetch(`${dep.urlPaquete}${sep}renovar=${Math.round(dep.ahora())}`, { cache: 'no-store' });
    if (!r?.ok) return { ok: false, motivo: `el paquete respondió ${r?.status}` };
    paquete = await r.json();
  } catch (e) {
    return { ok: false, motivo: `sin señal (${e?.message || e})` };
  }
  if (!paquete || typeof paquete.version !== 'string' || !Array.isArray(paquete.fichas)) return { ok: false, motivo: 'paquete inválido' };
  const e = iniciarVigencia(paquete.vigenciaHoras);
  return { ok: true, version: paquete.version, venceEn: e.venceEn };
}

/** Al arrancar (visitante y Panel): verifica; si venció, borra y, si hay red, intenta renovar. Devuelve el estado final. */
export async function asegurarVigencia() {
  // Si se borró localStorage pero IndexedDB dice «vencido», se respeta el vencido
  if (!leer()?.activadoEn) {
    const reg = await leerRegistroSW();
    if (reg?.venceEn) escribir({ activadoEn: reg.venceEn - HORAS_DEFECTO * 3600e3, venceEn: reg.venceEn, vencido: !!reg.vencido || ahora() >= reg.venceEn, motivo: 'tiempo', ultimaVista: 0 });
  }
  let e = verificarVigencia();
  if (e.estado === 'vencido') {
    await borrarContenido();
    const r = await renovar();
    if (r.ok) e = verificarVigencia();
  }
  return e;
}

/** { hora: 'HH:MM', manana: bool } para mostrar en la interfaz. */
export function textoHora(ms, idioma = 'es') {
  if (!ms) return { hora: '', manana: false };
  const d = new Date(ms);
  const hh = d.toLocaleTimeString(idioma === 'en' ? 'en-US' : 'es-CO', { hour: '2-digit', minute: '2-digit' });
  const hoy = new Date(ahora());
  const manana = d.toDateString() !== hoy.toDateString();
  return { hora: hh, manana };
}
