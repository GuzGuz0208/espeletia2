// Configuración de la sincronización con la base (contrato §5) para la interfaz y el Panel.
// Sin urlBase (por defecto, la demo en modo avión) js/sync.js no hace ninguna petición de red: queda solo el modo USB.
// urlBase se guarda en este dispositivo desde el Panel (p. ej. http://192.168.4.1:8090, la base de Brisas).

import * as sync from './sync.js';

const CLAVE_URL = 'fray.sync.urlBase';

export function urlBase() {
  try { return localStorage.getItem(CLAVE_URL) || null; } catch { return null; }
}

export function guardarUrlBase(url) {
  const limpia = String(url || '').trim().replace(/\/+$/, '');
  if (limpia && !/^https?:\/\/[^\s/]+/.test(limpia)) throw new Error('La dirección debe empezar por http:// o https://');
  try { if (limpia) localStorage.setItem(CLAVE_URL, limpia); else localStorage.removeItem(CLAVE_URL); } catch { /* nada */ }
  return limpia || null;
}

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
  return sync.iniciarSync({ urlBase: urlBase(), clavePublicaJwk: await clavePublica(), versionLocal, alPaqueteNuevo, alAvisos });
}

export { sync };
