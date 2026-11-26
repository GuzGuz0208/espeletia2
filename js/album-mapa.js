// Mapa del sendero: perfil sencillo de las cinco estaciones con la altura y la cita que trae el paquete.
// Sin coordenadas ni GPS (los guiones no traen coordenadas): es un dibujo de subida, no un mapa para orientarse.
// Toca una estación para preguntarle a Fray allí. Las estaciones visitadas se marcan.
import { E, estaciones } from './album-estado.js';
import { t } from './album-textos.js';
import { $, esc } from './album-util.js';

export function pintarMapa(irEstacion) {
  const v = $('#vista-mapa');
  const ests = estaciones().filter((e) => e.altitud?.m);
  if (!ests.length) { v.innerHTML = `<h1 class="mapa-titulo">${esc(t('mapa.titulo'))}</h1><p class="sub">${esc(t('det.sinDato'))}</p>`; return; }
  const W = 360, H = 300, x0 = 36, x1 = W - 36, yTop = 60, yBot = 230;
  const min = Math.min(...ests.map((e) => e.altitud.m)), max = Math.max(...ests.map((e) => e.altitud.m));
  const pos = ests.map((e, i) => ({ e, x: x0 + ((x1 - x0) * i) / Math.max(1, ests.length - 1), y: yBot - ((e.altitud.m - min) / Math.max(1, max - min)) * (yBot - yTop) }));
  const ruta = pos.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const fuentes = E.paquete?.fuentes || {};
  const citas = [...new Set(ests.flatMap((e) => (e.altitud.citas || []).map((c) => `${fuentes[c.guion]?.titulo || c.guion} p. ${c.pagina}`)))].join(' · ');
  const alt = (m) => `${m.toLocaleString('es-CO')} m`;
  v.innerHTML = `
    <h1 class="mapa-titulo">${esc(t('mapa.titulo'))}</h1>
    <p class="sub">${esc(t('mapa.sub'))}</p>
    <svg class="perfil" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('mapa.alt'))}">
      <path class="perfil-monte" d="${ruta} L${x1} ${H} L${x0} ${H}Z"/>
      <path class="perfil-ruta-sombra" d="${ruta}"/><path class="perfil-ruta" d="${ruta}"/>
      ${pos.map((p, i) => `<g class="perfil-pin${E.visitadas[p.e.id] ? ' hecha' : ''}"><circle cx="${p.x}" cy="${p.y}" r="13"/><text x="${p.x}" y="${p.y + 4.5}" text-anchor="middle">${i + 1}</text>
        <text class="perfil-alt" x="${p.x}" y="${p.y - 22}" text-anchor="middle">${esc(alt(p.e.altitud.m))}</text></g>`).join('')}
    </svg>
    <ol class="mapa-lista">${pos.map((p, i) => `<li><button type="button" class="mapa-est${E.visitadas[p.e.id] ? ' hecha' : ''}" data-est="${esc(p.e.id)}">
        <span class="mapa-num">${i + 1}</span><span class="mapa-txt"><b>${esc(p.e.nombre)}</b><small>${esc(alt(p.e.altitud.m))}${E.visitadas[p.e.id] ? ` · ${esc(t('mapa.hecha'))}` : ''}</small></span></button></li>`).join('')}</ol>
    <p class="nota-guia">${esc(t('mapa.nota'))}</p>
    <p class="mapa-fuente">${esc(t('mapa.fuente', { citas }))}</p>`;
  v.querySelectorAll('[data-est]').forEach((b) => { b.onclick = () => irEstacion(b.dataset.est); });
}
