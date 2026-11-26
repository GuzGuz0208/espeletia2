// Cromos por estación (spec docs/specs/cromos.md, PR #12 de Eduardo) conectados al Álbum del Páramo.
// Misma API y mismo evento que antes; ahora el sobre se abre con la animación del álbum (js/album-sobre.js) y el cromo queda
// pegado en su página. El dato y la cita salen de contenido/cromos.json (vigencia de 24 h, contrato §7).
//   import { abrirSobre, ganados, total } from './js/cromos.js';
//   document.dispatchEvent(new CustomEvent('fray:cromo', { detail: { id: 'brisas-agua' } }));
import * as vig from './vigencia.js';
import { darSobreEstacion } from './album-app.js';

const CLAVE = 'fray-cromos-ganados';
const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || '[]'); } catch { return []; } };

export const ganados = () => leer();
export const total = () => leer().length;

/** Abre el sobre del cromo (si es nuevo). Con el contenido vencido no se abre nada. */
export async function abrirSobre(id) {
  if (!id || !vig.verificarVigencia().vigente) return false;
  return darSobreEstacion(id);
}

document.addEventListener('fray:cromo', (evento) => {
  abrirSobre(evento.detail?.id).catch((error) => console.warn('[cromos]', error));
});
