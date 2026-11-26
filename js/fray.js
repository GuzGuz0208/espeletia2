// Fray · motor de preguntas y respuestas sin red (contrato: docs/contrato.md §2).
//   import * as fray from './js/fray.js';
//   await fray.cargar(paquete, { alAvance })   // índice e5 en el dispositivo, cacheado en IndexedDB por versión del paquete
//   const r = await fray.preguntar(texto, { estacion: 'lunares' })
//   fray.sinRespuesta() / fray.limpiarSinRespuesta()
//   await fray.similitud(['texto reescrito'], 'id-ficha')   // { frases, sim[texto][frase] } para el verificador
// Todo lo pesado corre en un Web Worker (js/fray-worker.js). El carril crítico (js/carril.js) se evalúa AQUÍ primero, sin
// esperar al modelo: una pregunta de seguridad se responde al instante aunque el índice aún esté cargando.
import { carril } from './carril.js';
import { ABSTENCION } from './nucleo.js';
import { verificarVigencia } from './vigencia.js';

export { carril, categoriaCarril, MENSAJES as MENSAJES_SEGURIDAD } from './carril.js';

let w = null, n = 0, local = null, cargaP = null, info = null;
const pend = new Map();
const CLAVE_SR = 'fray.sinRespuesta';

function worker() {
  if (w || local) return w;
  try {
    w = new Worker(new URL('./fray-worker.js', import.meta.url), { type: 'module', name: 'fray-motor' });
    w.onmessage = (e) => {
      const { id, res, error, aviso } = e.data;
      const p = pend.get(id); if (!p) return;
      if (aviso) { p.alAvance?.(aviso); return; }
      pend.delete(id);
      if (error) p.no(new Error(error)); else p.si(res);
    };
    w.onerror = (e) => {
      const err = new Error(`el motor no pudo arrancar (${e.message || 'worker'})`);
      for (const p of pend.values()) p.no(err);
      pend.clear(); w = null;
    };
  } catch (e) { w = null; }
  return w;
}

async function pedir(msg, alAvance) {
  if (!worker()) {
    // Sin Web Worker (navegador muy viejo): el mismo código corre en el hilo principal
    local ??= await import('./fray-worker.js');
    return local.manejar(msg, alAvance);
  }
  return new Promise((si, no) => {
    const id = ++n;
    pend.set(id, { si, no, alAvance });
    w.postMessage({ ...msg, id });
  });
}

// Construye (o recupera de IndexedDB) el índice del paquete. Devuelve { modo: 'semantico'|'lexico', fichas, vectores, tiempos }.
export function cargar(paquete, { alAvance, params } = {}) {
  cargaP = pedir({ tipo: 'cargar', paquete, opciones: { params } }, alAvance).then((r) => (info = r));
  return cargaP;
}

export async function preguntar(texto, { estacion = null } = {}) {
  const seg = carril(texto);
  if (seg) return seg;
  // Vigencia (contrato §7): con el contenido vencido no se responde con fichas (el carril de arriba sí sigue)
  if (verificarVigencia().estado === 'vencido') { descargar(); return { ...RESP_VENCIDO }; }
  if (!cargaP) throw new Error('llama a fray.cargar(paquete) antes de preguntar');
  await cargaP;
  const r = await pedir({ tipo: 'preguntar', texto, opciones: { estacion } });
  if (r.tipo === 'abstencion') anotarSinRespuesta(texto, estacion);
  return r;
}

// Similitud e5 de cada texto contra cada frase de la ficha: { frases: [..], sim: [[texto×frase]] | null (modo léxico), modo }.
// La usa el verificador del generador para comprobar, frase a frase, que lo reescrito está respaldado por el guion.
export async function similitud(textos, fichaId) {
  if (!cargaP) throw new Error('llama a fray.cargar(paquete) antes');
  await cargaP;
  return pedir({ tipo: 'similitud', textos: [].concat(textos), fichaId });
}

export const estado = () => info;

// Respuesta cuando venció la vigencia del contenido. La interfaz la muestra con su propio texto (i18n).
export const RESP_VENCIDO = Object.freeze({ tipo: 'vencido', breve: '', ampliar: null, citas: [], fichas: [], alternativas: [], aviso: null });

/** Suelta el índice de la memoria (al vencer la vigencia): termina el worker; hay que volver a llamar a cargar(). */
export function descargar() {
  try { w?.terminate(); } catch (e) { /* nada */ }
  for (const p of pend.values()) p.no(new Error('contenido vencido'));
  pend.clear();
  w = null; local = null; cargaP = null; info = null;
}
export const ABSTENCION_TEXTO = ABSTENCION;

// ---------- Preguntas sin respuesta (para que el personal cree fichas) ----------
// Solo el texto, la estación y la fecha (día). Sin datos personales. Máximo 500, en localStorage.
function leerSR() { try { return JSON.parse(localStorage.getItem(CLAVE_SR) || '[]'); } catch (e) { return []; } }
function anotarSinRespuesta(texto, estacion) {
  try {
    const l = leerSR();
    l.push({ texto: String(texto).slice(0, 300), estacion: estacion || null, fecha: new Date().toISOString().slice(0, 10) });
    localStorage.setItem(CLAVE_SR, JSON.stringify(l.slice(-500)));
  } catch (e) { /* sin localStorage: no se registra */ }
}
export function sinRespuesta() { return leerSR(); }
export function limpiarSinRespuesta() { try { localStorage.removeItem(CLAVE_SR); } catch (e) { /* nada */ } }
