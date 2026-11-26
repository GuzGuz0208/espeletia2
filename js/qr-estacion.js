// QR de estación firmados y verificables SIN RED (contrato §4, decisión 7).
// Texto del QR: `FRAY1|<estacion>|<firma>`, firma = primeros 8 hex de HMAC-SHA256(clave, `FRAY1|<estacion>`). WebCrypto, sin red.
// La UI lee el QR con lib/jsQR.js (script clásico: window.jsQR) y pasa el texto a verificarQR().
//   import { verificarQR, generarQR } from './js/qr-estacion.js';
//   const r = await verificarQR(texto, clave);   // { ok: true, estacion } | { ok: false, motivo: 'Este código no es del parque' }
// Copia en Python (para imprimir los QR): herramientas/qr_estaciones.py.
export const PREFIJO = 'FRAY1';
export const NO_ES_DEL_PARQUE = 'Este código no es del parque';

async function firma(estacion, clave) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(`${PREFIJO}|${estacion}`)));
  return [...s.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generarQR(estacion, clave) {
  if (!/^[a-z0-9-]{1,40}$/.test(estacion)) throw new Error(`estación inválida: ${estacion}`);
  return `${PREFIJO}|${estacion}|${await firma(estacion, clave)}`;
}

// estaciones (opcional): lista de ids válidos, p. ej. paquete.estaciones.map((e) => e.id)
export async function verificarQR(texto, clave, estaciones = null) {
  const no = { ok: false, motivo: NO_ES_DEL_PARQUE };
  const m = /^FRAY1\|([a-z0-9-]{1,40})\|([0-9a-f]{8})$/.exec(String(texto || '').trim());
  if (!m || !clave) return no;
  const [, estacion, f] = m;
  if (estaciones && !estaciones.includes(estacion)) return no;
  const esperada = await firma(estacion, clave);
  let dif = 0;
  for (let i = 0; i < 8; i++) dif |= esperada.charCodeAt(i) ^ f.charCodeAt(i);
  return dif === 0 ? { ok: true, estacion } : no;
}
