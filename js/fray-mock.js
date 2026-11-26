// MOTOR DE EJEMPLO (mock). Imita la API de js/fray.js (docs/contrato.md §2) para construir la interfaz
// mientras llega el motor real de la rama juan/motor. NO es el motor oficial:
// - búsqueda por palabras muy simple (sin e5-small),
// - carril de seguridad mínimo, solo para ver la tarjeta en la demo.
// En cuanto exista js/fray.js, js/ui-motor.js lo usa y este archivo deja de cargarse.

export const esEjemplo = true;

const CLAVE_SIN_RESPUESTA = 'fray.sinRespuesta';

const MSG_SEGURIDAD = 'Esto no lo puedo responder yo. Avisa a tu guía o al personal del parque: ellos tienen la información de hoy.';
const MSG_ABSTENCION = 'No tengo esa información en los guiones oficiales; pregúntale a tu guía o al personal del parque.';

// Carril crítico de ejemplo (el real está en js/fray.js y es más completo).
const SEGURIDAD = [
  /emergencia|auxilio|ayuda urgente|accidente|herid|sangr|desmay|perdid[oa]/,
  /mare[oa]|mal de altura|soroche|dolor|duele|frio extremo|hipotermia|respirar|vomit|me siento mal|sintoma|medicina|remedio|tratamiento|cura/,
  /se come|comer|comest|toxic|venen|tocar|lamer|beber agua de/,
  /volcan.*(hoy|estado|alerta|activo|erupcion)|alerta|erupcion/,
  /clima de hoy|va a llover|temperatura hoy|abierto hoy|horario|acceso|cerrad[oa]/,
];

const VACIAS = new Set('el la los las un una unos unas de del al a y o que es en por para con se su sus lo le me mi tu te como cual cuál qué que donde aqui aca hay son esta este esto eso fue muy mas'.split(' '));

export function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ');
}
function palabras(s) {
  return normalizar(s).split(/\s+/).filter((w) => w.length > 2 && !VACIAS.has(w)).map((w) => w.replace(/(es|s)$/, ''));
}

let paquete = null;
let indice = [];

export async function cargar(p) {
  paquete = p;
  indice = (p.fichas || [])
    .filter((f) => !f.bloqueada && f.estado !== 'borrador')
    .map((f) => ({ f, claves: new Set(palabras([f.titulo, f.preguntas?.join(' '), f.texto].join(' '))), preguntas: (f.preguntas || []).map(palabras) }));
  return { fichas: indice.length };
}

function puntuar(ent, q, estacion) {
  if (!q.length) return 0;
  let s = q.filter((w) => ent.claves.has(w)).length / q.length;
  for (const pq of ent.preguntas) {
    const comun = pq.filter((w) => q.includes(w)).length;
    if (pq.length) s = Math.max(s, comun / Math.max(pq.length, q.length) + 0.2);
  }
  if (estacion && ent.f.estacion === estacion) s += 0.1;
  return s;
}

function citasDe(f) {
  return (f.citas || []).map((c) => ({ guion: c.guion, titulo: paquete?.fuentes?.[c.guion]?.titulo || c.guion, pagina: c.pagina }));
}

function base(tipo, breve) {
  return { tipo, breve, ampliar: null, citas: [], fichas: [], tipoContenido: null, alternativas: [], aviso: null };
}

export async function preguntar(texto, { estacion } = {}) {
  if (!paquete) throw new Error('Primero llama a cargar(paquete)');
  await new Promise((r) => setTimeout(r, 250)); // simula el tiempo del motor
  const n = normalizar(texto);
  if (SEGURIDAD.some((re) => re.test(n))) return base('seguridad', MSG_SEGURIDAD);

  const q = palabras(texto);
  const orden = indice.map((e) => ({ e, s: puntuar(e, q, estacion) })).sort((a, b) => b.s - a.s);
  const mejor = orden[0];
  if (!mejor || mejor.s < 0.45) {
    guardarSinRespuesta(texto, estacion);
    return base('abstencion', MSG_ABSTENCION);
  }
  const f = mejor.e.f;

  const conflicto = (paquete.conflictos || []).find((c) => c.fichas.includes(f.id));
  if (conflicto) {
    const fs = conflicto.fichas.map((id) => paquete.fichas.find((x) => x.id === id)).filter(Boolean);
    return {
      ...base('conflicto', f.breve),
      ampliar: conflicto.nota || null,
      citas: fs.flatMap(citasDe),
      fichas: fs.map((x) => x.id),
      tipoContenido: f.tipo,
      aviso: 'Los guiones difieren',
    };
  }

  const segundo = orden[1];
  if (segundo && segundo.s > 0.45 && mejor.s - segundo.s < 0.05 && segundo.e.f.estacion !== f.estacion) {
    return { ...base('duda', '¿Sobre cuál de estos temas me preguntas?'), alternativas: [f, segundo.e.f].map((x) => ({ id: x.id, titulo: x.titulo })) };
  }

  return { ...base('respuesta', f.breve), ampliar: f.texto, citas: citasDe(f), fichas: [f.id], tipoContenido: f.tipo };
}

function guardarSinRespuesta(texto, estacion) {
  try {
    const l = sinRespuesta();
    l.push({ texto, estacion: estacion || null, fecha: new Date().toISOString() });
    localStorage.setItem(CLAVE_SIN_RESPUESTA, JSON.stringify(l.slice(-500)));
  } catch { /* sin almacenamiento: no se guarda */ }
}

export function sinRespuesta() {
  try { return JSON.parse(localStorage.getItem(CLAVE_SIN_RESPUESTA) || '[]'); } catch { return []; }
}

export function limpiarSinRespuesta() {
  try { localStorage.removeItem(CLAVE_SIN_RESPUESTA); } catch { /* nada */ }
}
