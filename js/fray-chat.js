// Cerebro del chat «Pregúntale a Fray» en el Álbum del Páramo: el motor nuevo (js/fray.js, contrato §2) con el contenido del
// parque (contenido/paquete.json, con vigencia de 24 h) y la reescritura opcional con IA local (js/generador.js, contrato §3).
// Reemplaza al chat viejo (chat.js + chat.json, que ya no se usa para responder).
// - Toda respuesta sale de los guiones con guion y página; el carril de seguridad va primero y prevalece sobre todo.
// - Con el contenido vencido solo queda el carril de seguridad (remite al guía).
import { fray as cargarFray, generador as cargarGenerador, info } from './ui-motor.js';
import { carril } from './carril.js';
import * as vig from './vigencia.js';
import { E } from './estado.js';
import { registrar } from './registro.js';

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
  // Seguridad primero: el carril manda siempre (también sobre «dato curioso» o «chiste»)
  if (carril(texto)) { const m = await cargar(); return empatia(texto, await m.preguntar(texto, estacion ? { estacion } : {})); }
  const pedido = pideCurioso(texto);
  if (pedido) {
    const r = datoCurioso(estacion, pedido);
    if (r) { registrar({ evento: 'pregunta', origen: 'curioso', estacion, pregunta: texto, tipo: r.tipo, fichas: r.fichas, citas: r.citas.map((c) => `${c.guion} p. ${c.pagina}`), breve: r.breve }); return r; }
  }
  const m = await cargar();
  return empatia(texto, await m.preguntar(texto, estacion ? { estacion } : {}));
}

// «Dime algo que no sepa», «un dato curioso», «cuéntame un chiste»: una ficha real de los guiones, con su cita.
const NORM = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
function pideCurioso(texto) {
  const t = NORM(texto);
  if (/\b(chiste|chistes|algo gracioso|hazme reir|joke)\b/.test(t)) return 'chiste';
  if (/\b(dato curioso|datos curiosos|algo curioso|algo interesante|que no sepa|que no sabia|sorprendeme|cuentame algo|dime algo|fun fact|tell me something)\b/.test(t)) return 'curioso';
  return null;
}
let ultimoCurioso = null;
function datoCurioso(estacion, pedido) {
  const P = E.guiones;
  if (!P) return null;
  const ok = (f) => !f.bloqueada && f.estado !== 'borrador' && f.tipo !== 'glosario' && f.breve && f.citas?.length && f.id !== ultimoCurioso;
  const propias = P.fichas.filter((f) => ok(f) && estacion && f.estacion === estacion);
  const todas = propias.length ? propias : P.fichas.filter(ok);
  if (!todas.length) return null;
  const f = todas[Math.floor(Math.random() * todas.length)];
  ultimoCurioso = f.id;
  const intro = pedido === 'chiste'
    ? 'No soy muy bueno con los chistes, pero el páramo sí sabe sorprender. ¿Sabías esto? '
    : '¿Sabías esto? ';
  return { tipo: 'respuesta', breve: intro + f.breve, ampliar: f.texto, citas: f.citas, fichas: [f.id], tipoContenido: f.tipo, curioso: true };
}

// Fray no tiene el dato: primero reconoce lo que pidió la persona (sin inventar nada), luego el mensaje de siempre.
const EMPATIA = [
  [/\b(hamburguesa|pizza|perro caliente|empanada|helado|dulces|mecato|snack|antojo|comida|almuerzo|almorzar|restaurante|cafeteria)\b/, '¡Uy, qué antojo! '],
  [/\b(hambre)\b/, 'Caminar en el páramo da hambre, te entiendo. '],
  [/\b(senal|internet|wifi|cobertura|datos moviles|hay red)\b/, 'Entiendo que quieras estar conectado. '],
  [/\b(cuanto (cuesta|vale|valen|cuestan)|precio|precios|tarifa|tarifas|cobran)\b/, 'Buena pregunta para planear la visita. '],
  [/\b(bano|banos|sanitario|sanitarios)\b/, 'Te entiendo, es importante saberlo. '],
];
function empatia(texto, r) {
  if (!r || (r.tipo !== 'abstencion' && r.categoria !== 'servicios')) return r;
  const t = NORM(texto);
  const e = EMPATIA.find(([re]) => re.test(t));
  return e && r.breve && !r.breve.startsWith(e[1]) ? { ...r, breve: e[1] + r.breve } : r;
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

/** Preguntas de ejemplo de la ficha de un cromo (para ofrecerlas al abrirlo): «¿Por qué se fracturan las rocas?». */
export function preguntasDeFicha(fichaId, n = 2) {
  const f = fichaPorId(fichaId);
  const bonita = (q) => q.replace(/^(¿?\s*)(\p{L})/u, (_, a, b) => a + b.toUpperCase());
  return [...new Set((f?.preguntas || []).map(bonita))].slice(0, n);
}
