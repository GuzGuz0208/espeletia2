// QR de estación firmados (docs/contrato.md §4). Texto: FRAY1|<estacion>|<firma>
// firma = HMAC-SHA256 de "FRAY1|<estacion>" con la clave del paquete, truncado a 8 hex.
// STUB de la interfaz: si la rama juan/motor trae su propio js/qr-estacion.js, ese reemplaza a este
// (mismas firmas de función: textoQR y verificarQR).
// Funciona sin red (Web Crypto). Requiere contexto seguro: localhost, 127.0.0.1 o https.

const PREFIJO = 'FRAY1';

async function hmac8(texto, clave) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(texto)));
  return [...sig.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Texto que va dentro del QR impreso de una estación. */
export async function textoQR(estacion, clave) {
  return `${PREFIJO}|${estacion}|${await hmac8(`${PREFIJO}|${estacion}`, clave)}`;
}

/** Devuelve el id de la estación si el QR es del parque y la firma valida; si no, null. */
export async function verificarQR(texto, clave) {
  const partes = String(texto || '').trim().split('|');
  if (partes.length !== 3 || partes[0] !== PREFIJO) return null;
  const [, estacion, firma] = partes;
  return (await hmac8(`${PREFIJO}|${estacion}`, clave)) === firma.toLowerCase() ? estacion : null;
}
