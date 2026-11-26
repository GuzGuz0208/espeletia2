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

// Clave para firmar y verificar los QR de estación. Sale del paquete; si no trae, se usa una de DEMOSTRACIÓN
// (no es secreta: solo sirve para la demo; el paquete real debe traer la suya).
export const CLAVE_QR_DEMO = 'fray-demo-no-secreta';
export const claveQR = (paquete) => paquete?.claveQR || paquete?.clave || CLAVE_QR_DEMO;
