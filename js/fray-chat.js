// Cerebro del chat «Pregúntale a Fray» en el Álbum del Páramo: el motor nuevo (js/fray.js, contrato §2) con el contenido del
// parque (contenido/paquete.json, con vigencia de 24 h) y la reescritura opcional con IA local (js/generador.js, contrato §3).
// Reemplaza al chat viejo (chat.js + chat.json, que ya no se usa para responder).
// - Toda respuesta sale de los guiones con guion y página; el carril de seguridad va primero y prevalece sobre todo.
// - Con el contenido vencido solo queda el carril de seguridad (remite al guía).
import { fray as cargarFray, generador as cargarGenerador, info } from './ui-motor.js';
import { carril } from './carril.js';
import * as vig from './vigencia.js';
import { E } from './estado.js';

let motor = null, listoP = null, listoYa = false;
let gen = null, genListo = false;

// Estaciones del álbum (e1…e5) → estaciones del paquete de Fray
export const ESTACION = { e1: 'brisas', e2: 'aguacerales', e3: 'arenales', e5: 'lunares', e4: 'tumbas' };

export const listo = () => listoYa;
export const vencido = () => vig.verificarVigencia().estado === 'vencido';
export const paquete = () => E.guiones;
export const fichaPorId = (id) => E.guiones?.fichas?.find((f) => f.id === id && !f.bloqueada) || null;
export const fuentes = () => E.guiones?.fuentes || {};
export const motorInfo = () => info;

/** Carga el motor e indexa el paquete (en un worker: no congela la pantalla). */
export function cargar({ alAvance } = {}) {
  if (listoP) return listoP;
  listoP = (async () => {
    if (!E.guiones) throw Object.assign(new Error('sin contenido del parque'), { vencido: vencido() });
    motor = await cargarFray();
    await motor.cargar(E.guiones, { alAvance });
    listoYa = true;
    try { gen = await cargarGenerador(); genListo = !!(await gen.disponible())?.listo; } catch { genListo = false; }
    return motor;
  })();
  listoP.catch(() => { listoP = null; });
  return listoP;
}
export function reintentar() { listoP = null; listoYa = false; return cargar(); }
/** Llegó otro paquete (Panel, sincronización o renovación): reindexa. */
export function recargar() { listoP = null; listoYa = false; return E.guiones ? cargar() : Promise.resolve(); }

// Estación en la que está el visitante (contexto opcional que mejora la búsqueda): la última visitada en las últimas 2 h
export function estacionActual() {
  const v = Object.entries(E.visitadas || {}).sort((a, b) => b[1] - a[1])[0];
  if (!v || Date.now() - v[1] > 2 * 3600e3) return null;
  return ESTACION[v[0]] || null;
}

/** Pregunta a Fray. Devuelve el resultado del contrato §2 (tipo respuesta | abstencion | seguridad | conflicto | duda | charla | vencido). */
export async function preguntar(texto, { estacion = estacionActual() } = {}) {
  if (vencido() || !E.guiones) return carril(texto) || { tipo: 'vencido', breve: '', citas: [] };
  const m = await cargar();
  return m.preguntar(texto, estacion ? { estacion } : {});
}

/** Reescritura con la IA local (si hay una lista). Solo cambia el texto si pasa el verificador (ok === true). */
export async function reescribir(r, pregunta, { timeoutMs = 8000 } = {}) {
  if (!genListo || r?.tipo !== 'respuesta') return null;
  try {
    const out = await gen.reescribir(r, pregunta, { timeoutMs });
    return out?.ok && out.texto ? out.texto : null;
  } catch (e) { console.warn('Generador:', e); return null; }
}

/** Sugerencias para empezar: preguntas de las fichas de la estación actual y generales. */
export function sugerencias(n = 4) {
  const P = E.guiones;
  if (!P) return [];
  const est = estacionActual();
  const fs = P.fichas.filter((f) => !f.bloqueada && f.estado !== 'borrador' && f.preguntas?.length);
  const propias = est ? fs.filter((f) => f.estacion === est) : fs.filter((f) => f.estacion === 'brisas');
  const generales = fs.filter((f) => !f.estacion && f.tipo !== 'glosario');
  const bonita = (q) => q.replace(/^(¿?\s*)(\p{L})/u, (_, a, b) => a + b.toUpperCase());
  return [...new Set([...propias, ...generales].map((f) => bonita(f.preguntas[0])))].slice(0, n);
}
