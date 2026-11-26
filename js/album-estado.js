// Estado del álbum (de espeletia-ai/js/estado.js, rama r2/instalar). Todo se guarda en el celular (IndexedDB).
// - El catálogo (album.json, en la raíz) solo trae ids, nombres, capítulos e ilustraciones: nada de los guiones.
// - El dato y la cita de cada cromo salen del contenido del parque, sujeto a la vigencia de 24 h (contrato §7):
//   contenido/cromos.json (cromos de Eduardo) o la ficha del paquete (dato = breve, cita = citas[0]).
//   Si el contenido venció, los cromos se ven solo con título e ilustración.
// - En IndexedDB solo se guarda qué cromos tienes, cuándo y dónde: nunca textos del guion.
import * as db from './album-db.js';
import * as vig from './vigencia.js';

export const bus = new EventTarget();
const emitir = (tipo, detalle) => bus.dispatchEvent(new CustomEvent(tipo, { detail: detalle }));

export const E = {
  cat: { capitulos: [], cromos: [] },
  paquete: null,      // paquete de Fray (lo pasa js/ui.js con 'fray:paquete'); null si venció
  datos: {},          // id -> { dato, cita: {guion, pagina, titulo}, tipo } (solo en memoria)
  nombre: '',
  album: {},          // id -> { fecha, estacion, foto, abierto }
  visitadas: {},      // estacionId -> fecha
  aqui: 0,            // última vez que el guía confirmó que el grupo está en el parque
  usados: [],         // códigos del guía ya usados en este teléfono
};

export async function cargar() {
  E.cat = await fetch('album.json').then((r) => r.json());
  const [album, visitadas, nombre, aqui, usados] = await Promise.all(['album', 'visitadas', 'nombre', 'aqui', 'usados'].map((k) => db.get('kv', k).catch(() => null)));
  E.album = album || {};
  for (const id of Object.keys(E.album)) if (!cromo(id)) delete E.album[id];
  E.visitadas = visitadas || {};
  E.nombre = nombre || '';
  E.aqui = aqui || 0;
  E.usados = usados || [];
  // Cromos ganados con la versión anterior (js/cromos.js guardaba la lista en localStorage)
  try {
    for (const id of JSON.parse(localStorage.getItem('fray-cromos-ganados') || '[]')) {
      if (cromo(id) && !E.album[id]) E.album[id] = { fecha: Date.now(), estacion: cromo(id).estacion, abierto: true };
    }
  } catch { /* sin almacenamiento */ }
}

export async function guardar() {
  await Promise.all([
    db.put('kv', 'album', E.album), db.put('kv', 'visitadas', E.visitadas), db.put('kv', 'nombre', E.nombre),
    db.put('kv', 'aqui', E.aqui), db.put('kv', 'usados', E.usados.slice(-300)),
  ]).catch(() => {});
  try { localStorage.setItem('fray-cromos-ganados', JSON.stringify(Object.keys(E.album))); } catch { /* nada */ }
}

// ---------- Datos de los guiones (con vigencia) ----------
export async function ponerPaquete(paquete) {
  E.paquete = paquete || null;
  E.datos = {};
  if (!paquete || !vig.verificarVigencia().vigente) { emitir('cambio', {}); return; }
  const titulo = (g) => paquete.fuentes?.[g]?.titulo || g;
  let ed = null;
  try { ed = await fetch('contenido/cromos.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)); } catch { ed = null; }
  for (const c of E.cat.cromos) {
    const e = ed?.cromos?.find((k) => k.id === c.id);
    const f = paquete.fichas?.find((k) => k.id === c.ficha && !k.bloqueada && k.estado !== 'borrador');
    if (e) E.datos[c.id] = { dato: e.dato, cita: { ...e.cita, titulo: titulo(e.cita.guion) }, tipo: e.tipo || 'ciencia' };
    else if (f?.breve && f.citas?.length) E.datos[c.id] = { dato: f.breve, cita: { ...f.citas[0], titulo: titulo(f.citas[0].guion) }, tipo: f.tipo === 'relato' ? 'relato' : 'ciencia' };
  }
  emitir('cambio', {});
}
/** Dato y cita del cromo, o null si el contenido no está (vencido o sin respaldo). */
export function datoDe(id) {
  if (!E.paquete || !vig.estadoVigencia().vigente) return null;
  return E.datos[id] || null;
}
export const vencido = () => vig.estadoVigencia().estado === 'vencido';

// ---------- Consultas ----------
export const cromos = () => E.cat.cromos;
export const cromo = (id) => E.cat.cromos.find((c) => c.id === id);
export const capitulos = () => E.cat.capitulos;
export const cromosDe = (cap) => E.cat.cromos.filter((c) => c.capitulo === cap);
export const tiene = (id) => !!E.album[id];
export const abierto = (id) => !!E.album[id]?.abierto;
export const total = () => E.cat.cromos.length;
export const pegados = () => E.cat.cromos.filter((c) => abierto(c.id)).length;
export const pendientes = () => Object.entries(E.album).filter(([, r]) => !r.abierto).sort((a, b) => a[1].fecha - b[1].fecha).map(([id]) => id);
export const capituloCompleto = (cap) => cromosDe(cap).every((c) => abierto(c.id));
export const estaciones = () => [...(E.paquete?.estaciones || [])].sort((a, b) => a.orden - b.orden);
export const estacion = (id) => E.paquete?.estaciones?.find((e) => e.id === id) || null;
export const nombreEstacion = (id) => estacion(id)?.nombre || ({ brisas: 'Brisas', aguacerales: 'Aguacerales', arenales: 'Arenales', lunares: 'Lunares', tumbas: 'Valle de las Tumbas' }[id] || id);
export const cromoDeEstacion = (est) => E.cat.cromos.find((c) => c.como === 'estacion' && c.estacion === est);

// ¿Está el visitante en el parque? Lo confirma el guía (código) o una estación visitada en las últimas 6 h.
export function enParque() {
  const H = 3600e3, ahora = Date.now();
  if (E.aqui && ahora - E.aqui < 2 * H) return true;
  return Object.values(E.visitadas).some((f) => ahora - f < 6 * H);
}
export async function marcarAqui() { E.aqui = Date.now(); await guardar(); emitir('cambio', {}); }

// ---------- Acciones ----------
export async function ganar(id, { estacionId = null } = {}) {
  if (tiene(id) || !cromo(id)) return false;
  const c = cromo(id);
  E.album[id] = { fecha: Date.now(), estacion: estacionId || c.estacion || null, foto: false, abierto: false };
  await guardar();
  emitir('ganado', { id });
  emitir('cambio', { id });
  return true;
}

export async function abrir(id) {
  if (!E.album[id] || E.album[id].abierto) return;
  E.album[id].abierto = true;
  await guardar();
  emitir('cambio', { id });
  if (capituloCompleto(cromo(id).capitulo)) emitir('capitulo', { cap: cromo(id).capitulo });
  if (pegados() === total()) emitir('completo', {});
}

export async function visitar(estId) {
  const nueva = !E.visitadas[estId];
  E.visitadas[estId] = Date.now();
  await guardar();
  emitir('cambio', {});
  return nueva;
}

export async function ponerNombre(n) { E.nombre = String(n || '').trim().slice(0, 24); await guardar(); emitir('cambio', {}); }

// Fotos propias del visitante en su cromo (solo en este teléfono)
async function miniatura(blob, lado = 480) {
  try {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, lado / Math.min(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close?.();
    return await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.82));
  } catch { return blob; }
}
const urls = {};
export async function ponerFoto(id, blob) {
  if (!E.album[id]) return;
  await db.put('fotos', id, await miniatura(blob));
  E.album[id].foto = true;
  if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; }
  await guardar();
  emitir('cambio', { id });
}
export async function fotoURL(id) {
  if (!E.album[id]?.foto) return null;
  if (urls[id]) return urls[id];
  const b = await db.get('fotos', id).catch(() => null);
  if (!b) return null;
  return (urls[id] = URL.createObjectURL(b));
}
export const fotoBlob = (id) => (E.album[id]?.foto ? db.get('fotos', id).catch(() => null) : Promise.resolve(null));

export async function vaciar() {
  E.album = {}; E.visitadas = {}; E.aqui = 0; E.usados = [];
  for (const k of Object.keys(urls)) { URL.revokeObjectURL(urls[k]); delete urls[k]; }
  await db.clear('fotos').catch(() => {});
  await guardar();
  emitir('cambio', {});
}
