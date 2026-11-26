// Configuración de la sincronización (contrato §5, decisión 12) para la interfaz y el Panel.
// Por defecto, urlBase es la publicación estática del propio despliegue: `{origen}/publicado` (manifest.json, paquete.json y
// avisos.json firmados en la base de Brisas y subidos con herramientas/publicar.ps1). Mismo origen: no se toca otro servidor.
// Desde el Panel se puede cambiar por el servidor de la base (p. ej. http://192.168.4.1:8090, servidor/sync_base.py).
// urlSubida: dónde subir las preguntas sin respuesta (POST /sin-respuesta). Un despliegue estático no recibe POST: sin
// urlSubida las preguntas esperan en el teléfono. Si se configuró un servidor de la base como urlBase, se usa ese.
// Sin señal (navigator.onLine === false) js/sync.js no intenta nada.

import * as sync from './sync.js';

const CLAVE_URL = 'fray.sync.urlBase';
const CLAVE_SUBIDA = 'fray.sync.urlSubida';

const leer = (k) => { try { return localStorage.getItem(k) || null; } catch { return null; } };

/** Lo publicado en este mismo despliegue (null si la página no se sirve por http/https, p. ej. file://). */
export function urlPorDefecto() {
  try { return /^https?:$/.test(location.protocol) ? `${location.origin}/publicado` : null; } catch { return null; }
}

/** Dirección guardada en el Panel (o null si se usa la de por defecto). */
export function urlBaseGuardada() { return leer(CLAVE_URL); }

/** Dirección efectiva de donde se bajan las actualizaciones. */
export function urlBase() { return urlBaseGuardada() || urlPorDefecto(); }

/** Dónde se suben las preguntas sin respuesta, o null (se quedan en cola). */
export function urlSubida() { return leer(CLAVE_SUBIDA) || urlBaseGuardada() || null; }

function guardar(k, url) {
  const limpia = String(url || '').trim().replace(/\/+$/, '');
  if (limpia && !/^https?:\/\/[^\s/]+/.test(limpia)) throw new Error('La dirección debe empezar por http:// o https://');
  try { if (limpia) localStorage.setItem(k, limpia); else localStorage.removeItem(k); } catch { /* nada */ }
  return limpia || null;
}

/** Vacío: vuelve a la publicación del despliegue. */
export function guardarUrlBase(url) { return guardar(CLAVE_URL, url); }
export function guardarUrlSubida(url) { return guardar(CLAVE_SUBIDA, url); }

let clave = null;
async function clavePublica() {
  if (clave) return clave;
  try {
    const r = await fetch('contenido/clave_publica.json');
    if (r.ok) clave = await r.json();
  } catch { /* sin clave: no se acepta ningún paquete firmado */ }
  return clave;
}

/** Arranca js/sync.js con la configuración del dispositivo. */
export async function arrancarSync({ versionLocal, alPaqueteNuevo, alAvisos }) {
  return sync.iniciarSync({
    urlBase: urlBase(), urlSubida: urlSubida(), clavePublicaJwk: await clavePublica(),
    versionLocal, alPaqueteNuevo, alAvisos,
  });
}

export { sync };
