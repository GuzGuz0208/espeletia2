// js/sync.js · Sincronización del dispositivo con la base (contrato §5 y §6). Módulo ES sin dependencias.
//
// - Solo corre si se configura `urlBase`. Sin urlBase (la demo en modo avión) no hace ninguna petición de red.
// - Nunca bloquea responder: todo va en segundo plano con setTimeout; responder no espera nada de aquí.
// - El paquete y los avisos se aceptan solo si la firma ECDSA P-256 del manifest valida con la clave pública del parque
//   (contenido/clave_publica.json) y los sha256 coinciden. Se verifica sin red, con WebCrypto.
// - Guarda en IndexedDB la versión actual y la anterior (para volver atrás) y la cola de preguntas sin respuesta.

const DEFECTO = {
  urlBase: null,
  clavePublicaJwk: null,
  alPaqueteNuevo: null,   // (paquete, { version, origen }) => la interfaz llama fray.cargar(paquete)
  alAvisos: null,         // (avisosVigentes) => banner
  versionLocal: null,     // versión del paquete que trae la app (no descarga una igual o menor)
  intervaloMin: 15,       // entre sincronizaciones correctas
  reintentoMin: 1,        // primer reintento tras un fallo; se duplica en cada fallo (backoff)
  maxMin: 60,             // techo del backoff
  primerIntentoMs: 3000,
  timeoutMs: 15000,
  maxCola: 500,
};

// Mismo criterio que herramientas/firmar_paquete.py (AVISO_PROHIBIDO). Si cambias uno, cambia el otro.
const AVISO_PROHIBIDO = new RegExp(
  'volc[aá]n|volc[aá]nic|cr[aá]ter|erupci|ceniza|sism|temblor|lahar|\\bsgc\\b|servicio\\s+geol[oó]gico|alerta' +
  '|salud|s[ií]ntoma|m[eé]dic|medicament|enferm|herid|hipotermia|soroche|mal\\s+de\\s+altura|mal\\s+de\\s+monta' +
  '|ox[ií]geno|primeros\\s+auxilios|evacua|emergencia', 'i');
const RE_CORREO = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const RE_NUMERO = /\+?\d[\d\s-]{6,}\d/g;
const MAX_TEXTO = 200;

class ErrorSync extends Error {}

let cfg = { ...DEFECTO };
let almacen = null;
let clavePromesa = null;
let temporizador = null;
let fallos = 0;
let enCurso = null;

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------------------------------------------------------------- almacenamiento

export function crearAlmacenMemoria() {
  const m = new Map();
  const copia = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  return {
    async get(k) { return copia(m.get(k)); },
    async set(k, v) { m.set(k, copia(v)); },
    async del(k) { m.delete(k); },
  };
}

export function crearAlmacenIDB(nombre = 'fray-sync') {
  let dbp = null;
  const db = () => (dbp ??= new Promise((ok, mal) => {
    const r = indexedDB.open(nombre, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  }));
  const tx = async (modo, fn) => {
    const d = await db();
    return new Promise((ok, mal) => {
      const t = d.transaction('kv', modo);
      const req = fn(t.objectStore('kv'));
      t.oncomplete = () => ok(req.result);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error);
    });
  };
  return {
    get: (k) => tx('readonly', (s) => s.get(k)),
    set: async (k, v) => { await tx('readwrite', (s) => s.put(v, k)); },
    del: async (k) => { await tx('readwrite', (s) => s.delete(k)); },
  };
}

function st() {
  if (!almacen) almacen = typeof indexedDB !== 'undefined' ? crearAlmacenIDB() : crearAlmacenMemoria();
  return almacen;
}

// ---------------------------------------------------------------- utilidades

const ahoraISO = () => new Date().toISOString();

function hoyLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function idAleatorio() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function limpiarTexto(t) {
  return String(t ?? '').replace(/\s+/g, ' ').trim()
    .replace(RE_CORREO, '[correo]').replace(RE_NUMERO, '[número]').slice(0, MAX_TEXTO);
}

export function compararVersion(a, b) {
  const pa = (String(a ?? '').match(/\d+/g) || []).map(Number);
  const pb = (String(b ?? '').match(/\d+/g) || []).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? -1, y = pb[i] ?? -1;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

async function sha256Hex(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64aBytes(b64) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

function clave() {
  if (!cfg.clavePublicaJwk) return Promise.reject(new ErrorSync('falta la clave pública del parque'));
  const { x, y } = cfg.clavePublicaJwk;
  return (clavePromesa ??= crypto.subtle.importKey(
    'jwk', { kty: 'EC', crv: 'P-256', x, y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
}

export function mensajeFirma(m) {
  return `FRAY1\n${m.version}\n${m.sha256}\n${m.avisos_sha256}\n${m.publicado}`;
}

async function verificarManifest(m) {
  const hex = /^[0-9a-f]{64}$/;
  if (!m || typeof m.version !== 'string' || !hex.test(m.sha256) || !hex.test(m.avisos_sha256) ||
      typeof m.publicado !== 'string' || typeof m.firma !== 'string') {
    throw new ErrorSync('manifest incompleto');
  }
  let firma;
  try { firma = b64aBytes(m.firma); } catch { throw new ErrorSync('firma ilegible'); }
  const ok = firma.length === 64 && await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, await clave(), firma, enc.encode(mensajeFirma(m)));
  if (!ok) throw new ErrorSync('firma inválida: el paquete no es del parque');
}

function avisoPermitido(a) {
  return a && typeof a === 'object' && a.tipo === 'operativo' && typeof a.texto === 'string' &&
    !AVISO_PROHIBIDO.test(`${a.texto} ${a.emitidoPor ?? ''}`) &&
    !Number.isNaN(Date.parse(a.vigenteDesde)) && !Number.isNaN(Date.parse(a.vigenteHasta));
}

// ---------------------------------------------------------------- red

async function pedir(ruta, opciones = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), cfg.timeoutMs);
  try {
    const r = await fetch(cfg.urlBase + ruta, { cache: 'no-store', ...opciones, signal: ctl.signal });
    if (!r.ok) throw new ErrorSync(`${ruta}: HTTP ${r.status}`);
    return r;
  } finally {
    clearTimeout(t);
  }
}

const pedirJSON = async (ruta) => (await pedir(ruta)).json();
const pedirBytes = async (ruta) => new Uint8Array(await (await pedir(ruta)).arrayBuffer());

// ---------------------------------------------------------------- estado local

async function idDispositivo() {
  let id = await st().get('dispositivo');
  if (!id) { id = idAleatorio(); await st().set('dispositivo', id); }
  return id;
}

async function versionActual() {
  const a = await st().get('paquete_actual');
  return a?.version ?? cfg.versionLocal ?? null;
}

async function leerEstado() { return (await st().get('estado')) || {}; }
async function guardarEstado(e) { await st().set('estado', e); }

// Activa lo que ya llegó: verifica hashes, guarda (actual → anterior) y avisa a la interfaz.
async function activar(m, paqueteBytes, avisosBytes, origen) {
  let paquete = null, avisos = null;
  if (paqueteBytes) {
    if (await sha256Hex(paqueteBytes) !== m.sha256) throw new ErrorSync('el paquete no coincide con su firma (sha256)');
    paquete = JSON.parse(dec.decode(paqueteBytes).replace(/^﻿/, ''));
    if (String(paquete.version) !== m.version) throw new ErrorSync('la versión del paquete no coincide con el manifest');
  }
  if (avisosBytes) {
    if (await sha256Hex(avisosBytes) !== m.avisos_sha256) throw new ErrorSync('los avisos no coinciden con su firma');
    const lista = JSON.parse(dec.decode(avisosBytes));
    if (!Array.isArray(lista)) throw new ErrorSync('avisos.json no es una lista');
    avisos = lista.filter(avisoPermitido);   // defensa extra: el validador de la base ya los rechaza
  }
  if (paquete) {
    const actual = await st().get('paquete_actual');
    if (actual) await st().set('paquete_anterior', actual);
    await st().set('paquete_actual', { version: m.version, manifest: m, paquete, instalado: ahoraISO(), origen });
    await st().del('version_descartada');
  }
  if (avisos) await st().set('avisos', { sha256: m.avisos_sha256, publicado: m.publicado, avisos });
  if (paquete && cfg.alPaqueteNuevo) {
    try { await cfg.alPaqueteNuevo(paquete, { version: m.version, origen }); } catch (e) { console.warn('[sync] alPaqueteNuevo', e); }
  }
  if (avisos && cfg.alAvisos) {
    try { cfg.alAvisos(await avisosVigentes()); } catch (e) { console.warn('[sync] alAvisos', e); }
  }
  return { paqueteNuevo: paquete ? m.version : null, avisosNuevos: !!avisos };
}

// ---------------------------------------------------------------- API pública

/** Guarda en local una pregunta que terminó en abstención. Sin datos personales; texto recortado a 200 caracteres. */
export async function registrarSinRespuesta(texto, estacion = null) {
  const t = limpiarTexto(texto);
  if (!t) return null;
  const p = { id: idAleatorio(), texto: t, estacion: estacion || null, fecha: hoyLocal(),
              versionPaquete: (await versionActual()) ?? '' };
  const cola = (await st().get('cola')) || [];
  cola.push(p);
  await st().set('cola', cola.slice(-cfg.maxCola));
  return p;
}

export async function colaSinRespuesta() { return (await st().get('cola')) || []; }

async function subirCola() {
  const cola = await colaSinRespuesta();
  if (!cola.length) return 0;
  const lote = cola.slice(0, 100);
  const r = await pedir('/sin-respuesta', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dispositivo: await idDispositivo(), preguntas: lote }),
  });
  const j = await r.json().catch(() => null);
  if (!j?.ok || !Array.isArray(j.ids)) throw new ErrorSync('el servidor no confirmó la recepción de la cola');
  const confirmados = new Set(j.ids);
  // Se relee la cola: pudo entrar una pregunta nueva mientras subía.
  await st().set('cola', (await colaSinRespuesta()).filter((p) => !confirmados.has(p.id)));
  return lote.filter((p) => confirmados.has(p.id)).length;
}

async function _sincronizar() {
  const est = await leerEstado();
  est.ultimoIntento = ahoraISO();
  const res = { ok: true, subidas: 0, paqueteNuevo: null, avisosNuevos: false, error: null };
  try {
    res.subidas = await subirCola();
    const m = await pedirJSON('/manifest.json');
    await verificarManifest(m);
    const descartada = await st().get('version_descartada');
    const nueva = compararVersion(m.version, await versionActual()) > 0 && m.version !== descartada;
    const guardados = await st().get('avisos');
    const avisosCambian = !guardados || guardados.sha256 !== m.avisos_sha256;
    const pb = nueva ? await pedirBytes('/paquete.json') : null;
    const ab = avisosCambian ? await pedirBytes('/avisos.json') : null;
    Object.assign(res, await activar(m, pb, ab, 'red'));
    Object.assign(est, { ultimaSincronizacion: ahoraISO(), origen: 'red', ultimoError: null, versionServidor: m.version });
    fallos = 0;
  } catch (e) {
    fallos += 1;
    res.ok = false;
    res.error = e?.name === 'AbortError' ? 'sin respuesta de la base (tiempo agotado)' : String(e?.message || e);
    est.ultimoError = res.error;
  }
  await guardarEstado(est);
  return res;
}

/** Sincroniza ahora (subir cola → manifest → paquete/avisos si cambiaron). No lanza: devuelve {ok, error, …}. */
export function sincronizar() {
  if (!cfg.urlBase) return Promise.resolve({ ok: false, error: 'sincronización desactivada (sin urlBase)' });
  return (enCurso ??= _sincronizar().finally(() => { enCurso = null; }));
}

function programar(ms) {
  clearTimeout(temporizador);
  temporizador = setTimeout(async () => {
    if (globalThis.navigator?.onLine === false) return programar(cfg.reintentoMin * 60000);
    const r = await sincronizar();
    programar(r.ok ? cfg.intervaloMin * 60000
      : Math.min(cfg.reintentoMin * 60000 * 2 ** Math.max(0, fallos - 1), cfg.maxMin * 60000));
  }, ms);
  temporizador?.unref?.();
}

function alOnline() { fallos = 0; programar(0); }

export function detener() {
  clearTimeout(temporizador);
  temporizador = null;
  globalThis.removeEventListener?.('online', alOnline);
}

/**
 * Configura y arranca la sincronización. Sin `urlBase` queda solo el modo USB (importarPaquete / exportarCola).
 * opciones: { urlBase, clavePublicaJwk, alPaqueteNuevo, alAvisos, versionLocal, intervaloMin, reintentoMin, maxMin,
 *             primerIntentoMs, timeoutMs, almacen }
 */
export function iniciarSync(opciones = {}) {
  detener();
  cfg = { ...DEFECTO, ...opciones };
  cfg.urlBase = opciones.urlBase ? String(opciones.urlBase).replace(/\/+$/, '') : null;
  if (opciones.almacen) almacen = opciones.almacen;
  clavePromesa = null;
  fallos = 0;
  if (cfg.urlBase) {
    globalThis.addEventListener?.('online', alOnline);
    programar(cfg.primerIntentoMs);
  }
  return { sincronizar, detener, estado: estadoSync };
}

/** Paquete descargado y activo (o null si solo está el que trae la app). Llamarlo al arrancar, antes de fray.cargar. */
export async function paqueteGuardado() {
  return (await st().get('paquete_actual'))?.paquete ?? null;
}

/** Vuelve a la versión anterior guardada. La versión descartada no se vuelve a bajar sola (sí una más nueva). */
export async function volverAtras() {
  const actual = await st().get('paquete_actual');
  const anterior = await st().get('paquete_anterior');
  if (!anterior) return { ok: false, motivo: 'no hay versión anterior guardada' };
  await st().set('paquete_actual', anterior);
  if (actual) { await st().set('paquete_anterior', actual); await st().set('version_descartada', actual.version); }
  if (cfg.alPaqueteNuevo) await cfg.alPaqueteNuevo(anterior.paquete, { version: anterior.version, origen: 'volver' });
  return { ok: true, version: anterior.version };
}

/** Avisos vigentes ahora (y para la estación, si se da). Los vencidos se ocultan solos. */
export async function avisosVigentes({ ahora = new Date(), estacion = null } = {}) {
  const g = await st().get('avisos');
  const t = ahora.getTime();
  return (g?.avisos || []).filter((a) => avisoPermitido(a) &&
    Date.parse(a.vigenteDesde) <= t && t < Date.parse(a.vigenteHasta) &&
    (!estacion || !Array.isArray(a.estaciones) || a.estaciones.includes(estacion)));
}

/** Plan USB: archivo para llevar a la base. Mismo formato que el cuerpo de POST /sin-respuesta. */
export async function exportarCola({ vaciar = false } = {}) {
  const preguntas = await colaSinRespuesta();
  const datos = { formato: 'fray-sin-respuesta-1', dispositivo: await idDispositivo(), exportado: hoyLocal(), preguntas };
  const texto = JSON.stringify(datos, null, 1);
  if (vaciar) await st().set('cola', []);
  const nombre = `fray-sin-respuesta-${datos.exportado}.json`;
  const blob = typeof Blob !== 'undefined' ? new Blob([texto], { type: 'application/json' }) : null;
  return { nombre, texto, blob, cantidad: preguntas.length };
}

/** Plan USB: importa fray-paquete-usb.json (File, Blob o texto). Verifica firma y sha256 sin red. */
export async function importarPaquete(archivo) {
  try {
    const texto = typeof archivo === 'string' ? archivo : await archivo.text();
    let b;
    try { b = JSON.parse(texto); } catch { throw new ErrorSync('el archivo no es un paquete de Fray'); }
    if (b?.formato !== 'fray-usb-1' || typeof b.paquete !== 'string' || typeof b.avisos !== 'string') {
      throw new ErrorSync('el archivo no es un paquete de Fray');
    }
    const m = b.manifest;
    await verificarManifest(m);
    const cmp = compararVersion(m.version, await versionActual());
    if (cmp < 0) throw new ErrorSync(`la versión ${m.version} es anterior a la instalada; usa «volver atrás»`);
    const guardados = await st().get('avisos');
    const r = await activar(m, cmp > 0 ? enc.encode(b.paquete) : null,
      !guardados || guardados.sha256 !== m.avisos_sha256 ? enc.encode(b.avisos) : null, 'usb');
    const est = await leerEstado();
    Object.assign(est, { ultimaSincronizacion: ahoraISO(), origen: 'usb', ultimoError: null });
    await guardarEstado(est);
    return { ok: true, version: m.version, ...r };
  } catch (e) {
    return { ok: false, motivo: String(e?.message || e) };
  }
}

/**
 * Vigencia (contrato §7): borra el contenido del parque guardado por sync (paquetes actual y anterior, avisos, estado).
 * Conserva el id del dispositivo y la cola de preguntas aún NO enviadas (no tienen contenido del parque; se suben con la
 * próxima señal). Tras esto versionActual() vuelve a la versión que trae la app.
 */
export async function borrarContenido() {
  for (const k of ['paquete_actual', 'paquete_anterior', 'avisos', 'version_descartada', 'estado']) await st().del(k);
}

/** Para mostrar «Última sincronización: …» en el panel. */
export async function estadoSync() {
  const est = await leerEstado();
  const actual = await st().get('paquete_actual');
  const anterior = await st().get('paquete_anterior');
  const cuando = est.ultimaSincronizacion ? new Date(est.ultimaSincronizacion) : null;
  let fecha = null;
  if (cuando) {
    try { fecha = cuando.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { fecha = est.ultimaSincronizacion; }
  }
  return {
    activo: !!cfg.urlBase,
    urlBase: cfg.urlBase,
    ultimaSincronizacion: est.ultimaSincronizacion ?? null,
    origen: est.origen ?? null,
    ultimoIntento: est.ultimoIntento ?? null,
    ultimoError: est.ultimoError ?? null,
    versionActual: actual?.version ?? cfg.versionLocal ?? null,
    versionAnterior: anterior?.version ?? null,
    pendientes: ((await st().get('cola')) || []).length,
    texto: fecha ? `Última sincronización: ${fecha}${est.origen === 'usb' ? ' (USB)' : ''}` : 'Sin sincronizar todavía',
  };
}
