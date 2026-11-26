// Conecta la interfaz con el motor (js/fray.js) y el generador (js/generador.js) del contrato.
// Si todavía no existen en esta rama, usa los de ejemplo (js/fray-mock.js, js/generador-mock.js).
// Así, cuando llegue el motor real basta con copiar sus archivos: no hay que tocar la interfaz.

export const info = { motor: null, generador: null, errores: [] };

async function importarO(real, ejemplo, nombre) {
  try {
    const m = await import(real);
    info[nombre] = 'real';
    return m;
  } catch (e) {
    info.errores.push(`${real}: ${e.message}`);
    info[nombre] = 'ejemplo';
    return import(ejemplo);
  }
}

let pFray = null;
let pGen = null;
export const fray = () => (pFray ||= importarO('./fray.js', './fray-mock.js', 'motor'));
export const generador = () => (pGen ||= importarO('./generador.js', './generador-mock.js', 'generador'));

// Clave para firmar y verificar los QR de estación (contrato §4). Sale del paquete (`claveQR`); si no trae, se usa la de
// DEMOSTRACIÓN de contenido/qr_clave_demo.json (la misma que usa herramientas/qr_estaciones.py para imprimir).
let demo = null;
export async function claveDemoQR() {
  if (demo) return demo;
  try { demo = (await (await fetch('contenido/qr_clave_demo.json')).json()).clave; } catch { demo = null; }
  return demo;
}
export async function claveQR(paquete) {
  return paquete?.claveQR || (await claveDemoQR());
}
