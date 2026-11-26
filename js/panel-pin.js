// PIN del Panel, uno por dispositivo. El personal lo define en el primer uso.
// Solo se guarda un hash PBKDF2-SHA-256 (sal aleatoria, 210 000 iteraciones) en localStorage de este dispositivo:
// nunca en el repo ni en el precache. La sesión vive solo en memoria (se pierde al recargar) y caduca por inactividad.

const CLAVE = 'fray.panel.pin';
const ITERACIONES = 210000;
const MINUTOS_SESION = 20;
export const LARGO_MINIMO = 6;

let hastaMs = 0;

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const deHex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

async function derivar(pin, sal, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter }, base, 256));
}

function leer() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { return null; }
}

/** ¿Este dispositivo ya tiene PIN? */
export const hayPin = () => !!leer()?.hash;

/** Define el PIN del dispositivo (solo si aún no hay uno). */
export async function definirPin(pin) {
  if (hayPin()) throw new Error('Este dispositivo ya tiene PIN.');
  if (!new RegExp(`^\\d{${LARGO_MINIMO},12}$`).test(pin)) throw new Error(`El PIN debe tener entre ${LARGO_MINIMO} y 12 números.`);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(CLAVE, JSON.stringify({ sal: hex(sal), iter: ITERACIONES, hash: await derivar(pin, sal, ITERACIONES) }));
  renovar();
}

/** Comprueba el PIN y abre la sesión. Devuelve true si es correcto. */
export async function comprobarPin(pin) {
  const g = leer();
  if (!g?.hash) return false;
  const ok = (await derivar(pin, deHex(g.sal), g.iter)) === g.hash;
  if (ok) renovar();
  return ok;
}

function renovar() { hastaMs = Date.now() + MINUTOS_SESION * 60000; }

/** true si hay sesión abierta (y la renueva). Llamarla en cada acción que cambie o saque datos. */
export function sesionActiva() {
  if (Date.now() > hastaMs) { hastaMs = 0; return false; }
  renovar();
  return true;
}

export function cerrarSesion() { hastaMs = 0; }

/** Borra el PIN y TODOS los datos del Panel en este dispositivo (versiones guardadas y preguntas sin respuesta). */
export async function restablecer() {
  cerrarSesion();
  try { localStorage.removeItem(CLAVE); localStorage.removeItem('fray.sinRespuesta'); } catch { /* nada */ }
  await new Promise((ok) => {
    const r = indexedDB.deleteDatabase('fray-paquete');
    r.onsuccess = r.onerror = r.onblocked = () => ok();
  });
}
