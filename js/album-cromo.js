// Componente de cromo (de espeletia-ai/js/cromo.js): frente (foto propia o ilustración, número, nombre, sello) y dorso
// (dato literal del guion con su cita). Escala con container queries: sirve en el álbum y en grande.
import { E, cromo as getCromo, fotoURL, capitulos, datoDe, nombreEstacion } from './album-estado.js';
import { ilustracion } from './album-arte.js';
import { t } from './album-textos.js';
import { esc, h } from './album-util.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fecha(ms) {
  const d = new Date(ms);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
export const num = (n) => String(n).padStart(2, '0');
export const arte = (c, opc) => ilustracion(c.arte || c.id, opc);
export const citaTxt = (cita) => `${cita.titulo || cita.guion} · p. ${cita.pagina}`;

export async function cromoEl(id, { tapado = false } = {}) {
  const c = getCromo(id);
  const r = E.album[id];
  const foto = r?.foto ? await fotoURL(id) : null;
  const cap = capitulos().find((k) => k.id === c.capitulo);
  const d = datoDe(id);
  const sello = r ? (r.estacion ? nombreEstacion(r.estacion) : t('parque').split(' · ')[0]) : '';
  const el = h(`
    <article class="cromo cap-${c.capitulo}${c.brillante ? ' brillante' : ''}${tapado ? ' tapado' : ''}" data-id="${c.id}">
      <div class="cromo-giro">
        <div class="cara frente">
          <div class="cromo-imagen">${foto ? `<img src="${foto}" alt="" decoding="async">` : arte(c)}</div>
          <span class="cromo-num">${num(c.n)}</span>
          <span class="cromo-nombre">${esc(c.nombre)}</span>
          ${r ? `<span class="cromo-sello"><b>${esc(sello)}</b><i>${esc(fecha(r.fecha))}</i></span>` : ''}
          ${c.brillante ? '<span class="holo" aria-hidden="true"></span>' : ''}
        </div>
        <div class="cara dorso">
          <div class="dorso-patron" aria-hidden="true"></div>
          <div class="dorso-texto">
            <p class="dorso-cab"><b>${num(c.n)}</b> ${esc(cap ? cap.es : '')}</p>
            <h3>${esc(c.nombre)}</h3>
            ${d ? `<p class="dorso-et">${esc(d.tipo === 'relato' ? t('det.relato') : t('det.datoGuion'))}</p>
            <p class="dorso-dato">${esc(d.dato)}</p>
            <p class="dorso-fuente">${esc(citaTxt(d.cita))}</p>` : `<p class="dorso-et">${esc(t('det.sinDato'))}</p>`}
            <p class="dorso-meta">${esc([r?.estacion ? nombreEstacion(r.estacion) : null, r ? fecha(r.fecha) : null, E.nombre || null].filter(Boolean).join(' — '))}</p>
          </div>
        </div>
      </div>
    </article>`);
  el.setAttribute('aria-label', `${num(c.n)}. ${c.nombre}.${d ? ` ${d.dato} (${citaTxt(d.cita)})` : ''}`);
  return el;
}

// Brillo holográfico que sigue el dedo o la inclinación del celular.
export function activarBrillo(el) {
  if (!el.classList.contains('brillante')) return () => {};
  const mover = (x, y) => { el.style.setProperty('--hx', `${x * 100}%`); el.style.setProperty('--hy', `${y * 100}%`); el.style.setProperty('--rx', `${(y - 0.5) * -10}deg`); el.style.setProperty('--ry', `${(x - 0.5) * 12}deg`); };
  const onPtr = (e) => { const b = el.getBoundingClientRect(); mover((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height); };
  const onOri = (e) => { if (e.gamma == null) return; mover(Math.min(1, Math.max(0, 0.5 + e.gamma / 60)), Math.min(1, Math.max(0, 0.5 + (e.beta - 45) / 60))); };
  el.addEventListener('pointermove', onPtr);
  addEventListener('deviceorientation', onOri);
  return () => { el.removeEventListener('pointermove', onPtr); removeEventListener('deviceorientation', onOri); };
}
