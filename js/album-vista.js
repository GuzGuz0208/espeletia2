// El álbum (de espeletia-ai/js/album.js): páginas por capítulo, espacios para pegar, índice al borde y detalle de cada cromo.
import { E, bus, cromo as getCromo, cromosDe, capitulos, abierto, tiene, pegados, total, pendientes, capituloCompleto, nombreEstacion, enParque, ponerFoto, datoDe } from './album-estado.js';
import { t } from './album-textos.js';
import { $, $$, h, esc, animar, reducido, aviso, hablar, hayVoz, atraparFoco, vibrar } from './album-util.js';
import { cromoEl, activarBrillo, num, arte, citaTxt } from './album-cromo.js';
import { formCodigo } from './album-guia.js';

let pagina = 0;
let acc = {};   // { abrirSobres, preguntar(id), irEstacion(est), pausa(c) }

export function iniciarAlbum(acciones) {
  acc = acciones;
  pintarIndice();
  pintarPagina(pagina, { sinAnimar: true });
  pintarCabezote();
  bus.addEventListener('cambio', () => { pintarCabezote(); refrescarPagina(); });
  let x0 = null, y0 = null;
  const pags = $('#paginas');
  pags.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  pags.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) irPagina(pagina + (dx < 0 ? 1 : -1));
    x0 = null;
  });
  $('#btn-sobres').onclick = () => acc.abrirSobres();
}

export function pintarCabezote() {
  const n = pegados();
  $('#cuenta-n').textContent = n;
  $('#cuenta-t').textContent = total();
  $('#barra-album').style.width = `${(n / total()) * 100}%`;
  $('#album-dueno').textContent = E.nombre ? t('de', { nombre: E.nombre }) : t('parque');
  const p = pendientes().length;
  $('#btn-sobres').hidden = p === 0;
  $('#sobres-txt').textContent = p === 1 ? t('album.sobre1') : t('album.sobres', { n: p });
  const badge = $('#muelle-badge');
  if (badge) { badge.hidden = p === 0; badge.textContent = p; }
  $('#pista').textContent = n === total() ? t('pista.fin') : n === 0 && !p ? t('pista.inicio') : t('pista.sigue');
  $$('#indice button').forEach((btn, i) => btn.classList.toggle('completo', capituloCompleto(capitulos()[i].id)));
}

function pintarIndice() {
  const ind = $('#indice');
  ind.innerHTML = '';
  capitulos().forEach((k, i) => {
    const b = h(`<button class="pestana cap-${k.id}" aria-label="${esc(k.num + '. ' + k.es)}"><span>${esc(k.num)}</span></button>`);
    if (i === pagina) b.setAttribute('aria-current', 'page');
    b.onclick = () => irPagina(i);
    ind.appendChild(b);
  });
}

async function construirPagina(i) {
  const k = capitulos()[i];
  const lista = cromosDe(k.id);
  const hechos = lista.filter((c) => abierto(c.id)).length;
  const pag = h(`<div class="pagina cap-${k.id}" data-cap="${k.id}">
      <header class="pagina-cab">
        <span class="pagina-num">${esc(k.num)}</span>
        <h2>${esc(k.es)}</h2>
        <span class="pagina-cuenta">${hechos}/${lista.length}</span>
      </header>
      <div class="ranuras"></div>
      ${hechos === lista.length ? `<p class="pagina-completa">${esc(t('album.capCompleto'))}</p>` : ''}
      <footer class="pagina-pie"><span>${esc(t('parque'))}</span><span>${i + 1}</span></footer>
    </div>`);
  const ran = $('.ranuras', pag);
  for (const c of lista) ran.appendChild(await ranura(c));
  return pag;
}

async function ranura(c) {
  const b = h(`<button class="ranura" data-id="${c.id}"></button>`);
  if (abierto(c.id)) {
    b.classList.add('llena');
    b.appendChild(await cromoEl(c.id));
    b.setAttribute('aria-label', `${num(c.n)}. ${c.nombre}`);
  } else {
    const enSobre = tiene(c.id);
    const como = enSobre ? t('sobre.titulo') : t(`tipo.${c.como}`);
    b.innerHTML = `${arte(c, { silueta: true })}<span class="ranura-num">${num(c.n)}</span><span class="ranura-como">${esc(como)}</span>`;
    if (enSobre) b.classList.add('en-sobre');
    b.setAttribute('aria-label', `${num(c.n)}. ${como}`);
  }
  b.onclick = () => (tiene(c.id) && !abierto(c.id) ? acc.abrirSobres() : abrirDetalle(c.id));
  return b;
}

let pintando = Promise.resolve();
export function pintarPagina(i, { direccion = 0, sinAnimar = false } = {}) {
  pintando = pintando.then(async () => {
    const cont = $('#paginas');
    const nueva = await construirPagina(i);
    const vieja = cont.querySelector('.pagina');
    if (!vieja || sinAnimar || reducido() || direccion === 0) { cont.replaceChildren(nueva); return; }
    // Pasar la hoja: la página de arriba gira sobre el lomo.
    nueva.classList.add('debajo');
    if (direccion > 0) {
      cont.insertBefore(nueva, vieja);
      vieja.classList.add('girando');
      await animar(vieja, [
        { transform: 'perspective(1400px) rotateY(0deg)', filter: 'brightness(1)' },
        { transform: 'perspective(1400px) rotateY(-100deg)', filter: 'brightness(.78)' },
      ], { duration: 560, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' });
      vieja.remove();
    } else {
      cont.appendChild(nueva);
      nueva.classList.remove('debajo'); nueva.classList.add('girando');
      await animar(nueva, [
        { transform: 'perspective(1400px) rotateY(-100deg)', filter: 'brightness(.78)' },
        { transform: 'perspective(1400px) rotateY(0deg)', filter: 'brightness(1)' },
      ], { duration: 560, easing: 'cubic-bezier(.45,.05,.3,1)' });
      vieja.remove();
    }
    nueva.classList.remove('debajo', 'girando');
  }).catch((e) => console.warn('[album]', e));
  return pintando;
}
function refrescarPagina() { pintarPagina(pagina, { sinAnimar: true }); }

export async function irPagina(i, { sinAnimar = false } = {}) {
  if (i < 0 || i >= capitulos().length) return;
  if (i === pagina) return pintando;
  const dir = i > pagina ? 1 : -1;
  pagina = i;
  $$('#indice button').forEach((b, j) => (j === i ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  vibrar(15);
  return pintarPagina(i, { direccion: dir, sinAnimar });
}
export const paginaDe = (id) => capitulos().findIndex((k) => k.id === getCromo(id).capitulo);
export const ranuraDe = (id) => $(`#paginas .ranura[data-id="${id}"]`);
export const esperarPintado = () => pintando;

// ---------- Detalle ----------
let soltarFoco = null;
export async function abrirDetalle(id) {
  const c = getCromo(id), capa = $('#capa-detalle');
  capa.innerHTML = '';
  const caja = h(`<div class="detalle"><button class="cerrar-x" aria-label="${esc(t('det.cerrar'))}">×</button></div>`);
  capa.appendChild(caja);
  if (abierto(id)) {
    const card = await cromoEl(id);
    card.classList.add('grande');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const voltear = () => { card.classList.toggle('volteado'); vibrar(10); };
    card.onclick = voltear;
    card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); voltear(); } };
    caja.appendChild(card);
    capa._quitar = activarBrillo(card);
    caja.appendChild(h(`<p class="detalle-nota">${esc(t('det.tocaVoltear'))}</p>`));
    const d = datoDe(id);
    const a = h(`<div class="acciones acciones-detalle">
      ${d ? `<button class="btn btn-flor" data-a="preguntar">${esc(t('det.preguntar'))}</button>` : ''}
      ${d && hayVoz() ? `<button class="btn btn-linea" data-a="escuchar">${esc(t('det.escuchar'))}</button>` : ''}
      <label class="btn btn-linea">${esc(t('det.foto'))}<input type="file" accept="image/*" capture="environment" hidden></label>
    </div>`);
    caja.appendChild(a);
    a.querySelector('[data-a="preguntar"]')?.addEventListener('click', () => { cerrarDetalle(); acc.preguntar(id); });
    a.querySelector('[data-a="escuchar"]')?.addEventListener('click', () => hablar(`${c.nombre}. ${d.dato}`));
    a.querySelector('input[type="file"]').onchange = async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      await ponerFoto(id, f);
      aviso(t('det.fotoLista'));
      abrirDetalle(id);
    };
  } else {
    caja.appendChild(comoConseguir(c));
  }
  caja.querySelector('.cerrar-x').onclick = cerrarDetalle;
  capa.onclick = (e) => { if (e.target === capa) cerrarDetalle(); };
  capa.hidden = false;
  soltarFoco = atraparFoco(capa);
  document.addEventListener('keydown', escDetalle);
  animar(caja, [{ transform: 'translateY(30px) scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
  (caja.querySelector('.cromo') || caja.querySelector('.btn') || caja.querySelector('.cerrar-x')).focus({ preventScroll: true });
}
function escDetalle(e) { if (e.key === 'Escape') cerrarDetalle(); }
export function cerrarDetalle() {
  const capa = $('#capa-detalle');
  if (capa.hidden) return;
  capa._quitar && capa._quitar();
  capa.hidden = true; capa.innerHTML = '';
  soltarFoco && soltarFoco();
  document.removeEventListener('keydown', escDetalle);
}

function comoConseguir(c) {
  const box = h(`<div class="como">
      <div class="como-ilus">${arte(c, { silueta: true })}<span class="ranura-num">${num(c.n)}</span></div>
      <p class="como-tipo">${esc(t(`tipo.${c.como}`))}</p>
      <h3>${esc(c.nombre)}</h3>
      <p class="como-txt"></p>
      <div class="como-accion"></div>
    </div>`);
  const txt = $('.como-txt', box), cont = $('.como-accion', box);
  const boton = (texto, fn, clase = 'btn-flor') => { const b = h(`<button class="btn ${clase}">${esc(texto)}</button>`); b.onclick = fn; cont.appendChild(b); };
  const alGuia = (r) => {
    if (r.ganado) { cerrarDetalle(); acc.abrirSobres(); return; }
    aviso(t(r.msg), 3500);
    if (r.msg === 'guia.aqui') { cerrarDetalle(); abrirDetalle(c.id); }
  };
  const planB = (accion) => {
    const d = h(`<details class="plan-b"><summary>${esc(t('como.guia'))}</summary></details>`);
    d.appendChild(formCodigo(accion, alGuia));
    cont.appendChild(d);
  };
  if (c.como === 'estacion') {
    txt.textContent = t('como.estacion', { est: nombreEstacion(c.estacion) });
    boton(t('accion.irEstacion'), () => { cerrarDetalle(); acc.irEstacion(c.estacion); });
    planB(`e:${c.estacion}`);
  } else if (c.como === 'pregunta') {
    txt.textContent = c.estacion ? t('como.preguntaEst', { est: nombreEstacion(c.estacion) }) : t('como.pregunta');
    if (c.estacion) boton(t('accion.irEstacion'), () => { cerrarDetalle(); acc.irEstacion(c.estacion); });
    planB(`h:${c.id}`);
  } else if (c.como === 'pausa') {
    if (!enParque()) { txt.textContent = t('como.pausaLugar'); cont.appendChild(formCodigo('aqui', alGuia)); }
    else { txt.textContent = t('como.pausa'); boton(t('accion.pausa'), () => { cerrarDetalle(); acc.pausa(c); }); }
  }
  return box;
}

export function citaDe(id) { const d = datoDe(id); return d ? citaTxt(d.cita) : ''; }
