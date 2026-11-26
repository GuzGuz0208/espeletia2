// Almacenamiento local (IndexedDB). Todo queda en el celular, sin internet.
const DB_NAME = 'paramo-cromos';
const VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('fotos')) db.createObjectStore('fotos');
        if (!db.objectStoreNames.contains('muestras')) db.createObjectStore('muestras', { autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((r) => { out = r; });
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

export const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
export const put = (store, key, val) => tx(store, 'readwrite', (s) => (key === undefined ? s.put(val) : s.put(val, key)));
export const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
export const clear = (store) => tx(store, 'readwrite', (s) => s.clear());
export const all = (store) => tx(store, 'readonly', (s) => s.getAll());

export async function persist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* sin soporte */ }
  return false;
}
