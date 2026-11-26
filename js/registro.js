// Registro de la prueba en el teléfono (contrato §8): cada intercambio con Fray queda en IndexedDB ('fray-registro', máx. 500,
// rotando) y además sale por consola como `FRAYLOG {json}` para leerlo por adb (herramientas/registros_adb.ps1|sh).
//   import * as registro from './js/registro.js';
//   registro.registrar({ evento: 'pregunta', pregunta, estacion, tipo, ... })   // lo llaman fray.js y generador.js, no la UI
//   await registro.leerRegistro()      // [entradas] (más viejas primero)
//   await registro.exportarRegistro()  // descarga fray-registro-AAAAMMDD-HHMM.json
//   await registro.limpiarRegistro()
// Sin datos personales: solo el texto de la pregunta, lo que respondió Fray, tiempos y un identificador aleatorio del dispositivo
// (no sale del teléfono salvo que alguien exporte el archivo). Vence con el contenido: js/vigencia.js lo borra a las 24 h.
const DB = 'fray-registro', ALMACEN = 'e', MAX = 500, CLAVE_DISP = 'fray.dispositivo';
let version = null;
export const configurarRegistro = ({ versionPaquete } = {}) => { if (versionPaquete !== undefined) version = versionPaquete; };

function dispositivo() {
  try {
    let d = localStorage.getItem(CLAVE_DISP);
    if (!d) { d = 'd-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(CLAVE_DISP, d); }
    return d;
  } catch (e) { return 'd-sin-almacen'; }
}

function abrir() {
  return new Promise((si, no) => {
    if (typeof indexedDB === 'undefined') { no(new Error('sin IndexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN, { autoIncrement: true });
    r.onsuccess = () => si(r.result); r.onerror = () => no(r.error);
  });
}

const recorta = (s, n = 600) => (s == null ? s : String(s).slice(0, n));

// Guarda una entrada (no bloquea ni lanza). Devuelve la entrada completa.
export function registrar(entrada = {}) {
  const e = { fecha: new Date().toISOString(), dispositivo: dispositivo(), paquete: version, ...entrada };
  for (const k of ['pregunta', 'breve', 'texto']) if (typeof e[k] === 'string') e[k] = recorta(e[k]);
  try { console.info('FRAYLOG ' + JSON.stringify(e)); } catch (err) { /* nada */ }
  (async () => {
    try {
      const d = await abrir();
      await new Promise((si) => {
        const tx = d.transaction(ALMACEN, 'readwrite'), st = tx.objectStore(ALMACEN);
        st.add(e);
        const c = st.count();
        c.onsuccess = () => {
          const sobran = c.result - MAX;
          if (sobran > 0) {
            const cur = st.openKeyCursor ? st.openKeyCursor() : st.openCursor();
            let n = 0;
            cur.onsuccess = () => { const k = cur.result; if (k && n < sobran) { st.delete(k.primaryKey ?? k.key); n++; k.continue(); } };
          }
        };
        tx.oncomplete = si; tx.onerror = si; tx.onabort = si;
      });
      d.close();
    } catch (err) { /* sin IndexedDB: queda solo la consola */ }
  })();
  return e;
}

export async function leerRegistro() {
  try {
    const d = await abrir();
    const out = await new Promise((si) => {
      const q = d.transaction(ALMACEN).objectStore(ALMACEN).getAll();
      q.onsuccess = () => si(q.result || []); q.onerror = () => si([]);
    });
    d.close();
    return out;
  } catch (e) { return []; }
}

const dos = (n) => String(n).padStart(2, '0');
export function nombreArchivo(f = new Date()) {
  return `fray-registro-${f.getFullYear()}${dos(f.getMonth() + 1)}${dos(f.getDate())}-${dos(f.getHours())}${dos(f.getMinutes())}.json`;
}

// Descarga el registro como JSON (en la APK la descarga va a /sdcard/Download si el WebView la permite).
export async function exportarRegistro() {
  const entradas = await leerRegistro();
  const datos = { formato: 'fray-registro/1', exportado: new Date().toISOString(), dispositivo: dispositivo(), paquete: version, entradas };
  const nombre = nombreArchivo();
  if (typeof document === 'undefined') return { nombre, datos };
  const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { nombre, n: entradas.length };
}

export async function limpiarRegistro() {
  try {
    const d = await abrir();
    await new Promise((si) => { const tx = d.transaction(ALMACEN, 'readwrite'); tx.objectStore(ALMACEN).clear(); tx.oncomplete = si; tx.onerror = si; });
    d.close();
    return true;
  } catch (e) { return false; }
}

// Para leerlo por DevTools (adb + webview_devtools_remote): frayRegistro.leer()
if (typeof globalThis !== 'undefined') globalThis.frayRegistro = { leer: leerRegistro, exportar: exportarRegistro, limpiar: limpiarRegistro };
