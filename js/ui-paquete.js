// Paquete de contenido en el dispositivo: versiones en IndexedDB (con vuelta atrás) y carga inicial.
// Orden de carga: última versión guardada por el Panel → contenido/paquete.json → ejemplo/paquete-ejemplo.json.
// Nada sale del dispositivo: todo es local.

const DB = 'fray-paquete';
const STORE = 'versiones';
const MAX_VERSIONES = 30;
const canal = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('fray-paquete') : null;

function abrir() {
  return new Promise((ok, mal) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'n', autoIncrement: true });
    req.onsuccess = () => {
      // Si otra pestaña quiere borrar o actualizar la base (p. ej. «Restablecer PIN»), se suelta enseguida
      req.result.onversionchange = () => req.result.close();
      ok(req.result);
    };
    req.onerror = () => mal(req.error);
  });
}

async function tx(modo, fn) {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const t = db.transaction(STORE, modo);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); ok(r?.result); };
    t.onerror = () => { db.close(); mal(t.error); };
  });
}

/** Todas las versiones guardadas, de la más nueva a la más vieja: [{ n, version, fecha, nota, paquete }]. */
export async function versiones() {
  try { return ((await tx('readonly', (s) => s.getAll())) || []).reverse(); } catch { return []; }
}

/** La versión vigente guardada en el dispositivo, o null. */
export async function vigente() {
  return (await versiones())[0] || null;
}

async function leerJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

/** Devuelve { paquete, origen } con el paquete que debe usarse ahora. */
export async function cargarPaquete() {
  const v = await vigente();
  // Lo editado en el Panel manda, salvo que se haya hecho sobre el paquete de ejemplo y ya exista el oficial
  if (v && !v.paquete.ejemplo) return { paquete: v.paquete, origen: 'dispositivo' };
  const base = await paqueteBase();
  if (v && base.origen === 'ejemplo') return { paquete: v.paquete, origen: 'dispositivo' };
  return base;
}

/** El paquete que viene con la app (sin cambios del Panel): contenido/paquete.json o, si aún no existe, el de ejemplo. */
export async function paqueteBase() {
  try { return { paquete: await leerJSON('contenido/paquete.json'), origen: 'contenido' }; } catch { /* aún no existe */ }
  return { paquete: await leerJSON('ejemplo/paquete-ejemplo.json'), origen: 'ejemplo' };
}

/** Siguiente número de versión con el formato del contrato: AAAA-MM-DD.n */
export function siguienteVersion(anterior) {
  const hoy = new Date().toISOString().slice(0, 10);
  const m = String(anterior || '').match(/(\d{4}-\d{2}-\d{2})\.(\d+)$/);
  const n = m && m[1] === hoy ? Number(m[2]) + 1 : 1;
  return `${hoy}.${n}`;
}

/** Guarda una nueva versión del paquete y avisa a las otras pestañas. Devuelve el paquete guardado. */
export async function guardarVersion(paquete, nota = '') {
  // El número sigue a la versión vigente (también al volver a una vieja: nunca se repite un número)
  const anterior = (await vigente())?.version || paquete.version;
  const nuevo = { ...structuredClone(paquete), version: siguienteVersion(anterior), actualizado: new Date().toISOString().slice(0, 10) };
  // `ejemplo: true` se conserva: así se sabe que estas ediciones parten del paquete de ejemplo
  await tx('readwrite', (s) => s.add({ version: nuevo.version, fecha: new Date().toISOString(), nota, paquete: nuevo }));
  // Recorta versiones viejas
  const todas = await versiones();
  for (const v of todas.slice(MAX_VERSIONES)) await tx('readwrite', (s) => s.delete(v.n));
  canal?.postMessage({ tipo: 'nueva-version', version: nuevo.version });
  return nuevo;
}

/** Escucha cuando el Panel guarda una versión nueva (en otra pestaña del mismo dispositivo). */
export function alCambiar(fn) {
  canal?.addEventListener('message', (e) => { if (e.data?.tipo === 'nueva-version') fn(e.data); });
}
