// Álbum del Páramo dentro de Fray: une el chat de la estación (js/ui.js) con el álbum, los sobres, el mapa y el modo guía.
// Eventos con js/ui.js (todos en document):
//   fray:paquete   {paquete|null}      ui.js → aquí: paquete activo (null si venció la vigencia)
//   fray:vista     {vista}             ui.js → aquí: se abrió #/album, #/mapa o #/guia
//   fray:respuesta {estacion, fichas}  ui.js → aquí: Fray respondió en una estación (puede dar un sobre)
//   fray:qr-guia   {texto}             ui.js → aquí: se leyó un QR del modo guía
//   fray:preguntar {estacion, texto}   aquí → ui.js: abrir el chat de la estación y preguntar
// El sobre de la estación lo pide js/cromos.js (evento fray:cromo) con darSobreEstacion().
import * as est from './album-estado.js';
import { E, bus } from './album-estado.js';
import { t } from './album-textos.js';
import { $, $$, esc, aviso, vibrar, animar } from './album-util.js';
import { iniciarAlbum, pintarCabezote, abrirDetalle, cerrarDetalle } from './album-vista.js';
import { iniciarSobres, abrirSobres } from './album-sobre.js';
import { pintarMapa } from './album-mapa.js';
import { entrarGuia, salirGuia, leerQR, aplicar } from './album-guia.js';
import { botonPDF } from './album-pdf.js';
import { lluvia } from './album-celebrar.js';
import * as pin from './panel-pin.js';

// El paquete puede llegar antes de que el álbum termine de cargar: se guarda el último y se aplica al estar listo
let paqueteUltimo = window.frayPaquete ?? null;
document.addEventListener('fray:paquete', (e) => { paqueteUltimo = e.detail?.paquete || null; listo.then(() => est.ponerPaquete(paqueteUltimo)); });

const listo = (async () => {
  await est.cargar();
  await est.ponerPaquete(paqueteUltimo);
  iniciarAlbum({ abrirSobres: () => abrirSobres(), preguntar, irEstacion, pausa });
  iniciarSobres({ irA: (v) => { if (v === 'album' && location.hash !== '#/album') location.hash = '#/album'; }, preguntar });
  conectar();
  pintarNombre();
  pintarResumen();
})();
listo.catch((e) => console.error('[album]', e));

const ultimaEstacion = () => {
  const v = Object.entries(E.visitadas).sort((a, b) => b[1] - a[1])[0];
  return v ? v[0] : null;
};

function irEstacion(id) { location.hash = `#/${encodeURIComponent(id || ultimaEstacion() || 'brisas')}`; }

// «Preguntar a Fray» desde un cromo: abre el chat de su estación (o la última visitada) con la pregunta de su ficha.
function preguntar(id) {
  const c = est.cromo(id);
  const f = E.paquete?.fichas?.find((k) => k.id === c.ficha);
  const q = f?.preguntas?.[0] || c.nombre;
  const texto = q.replace(/^(¿?\s*)(\p{L})/u, (_, a, b) => a + b.toUpperCase());
  document.dispatchEvent(new CustomEvent('fray:preguntar', { detail: { estacion: c.estacion || ultimaEstacion() || 'brisas', texto } }));
}

/** El sobre del cromo de la estación (lo llama js/cromos.js al recibir fray:cromo). */
export async function darSobreEstacion(id) {
  await listo;
  const c = est.cromo(id);
  if (!c) return false;
  if (c.estacion) await est.visitar(c.estacion);
  const nuevo = await est.ganar(id, { estacionId: c.estacion });
  if (!nuevo) return false;
  vibrar(40);
  // Se abre en la parada (el visitante ya está quieto en la estación), tras un momento para leer la respuesta
  setTimeout(() => abrirSobres(), 1200);
  return true;
}
export async function ganados() { await listo; return Object.keys(E.album); }

// Fray respondió en una estación: si la respuesta usa la ficha de un cromo «de pregunta», gana su sobre (no se abre solo).
async function alResponder({ estacion, fichas = [] }) {
  await listo;
  if (estacion) await est.visitar(estacion);
  // Sin estación elegida, solo cuenta si estuvo hace poco en una (los cromos se ganan en las paradas)
  if (!estacion && !est.enParque()) return;
  for (const c of est.cromos()) {
    if (c.como !== 'pregunta' || est.tiene(c.id)) continue;
    if (c.estacion && c.estacion !== estacion) continue;
    if (!c.fichas.some((f) => fichas.includes(f))) continue;
    await est.ganar(c.id, { estacionId: estacion });
    vibrar([30, 40, 30]);
    aviso(t('ganado.sobre'), 4500);
  }
}

// ---------- Pausa de contemplación: 2 minutos sin tocar la pantalla ----------
function pausa(c) {
  const capa = $('#capa-pausa'), totalMs = (c.segundos || 120) * 1000;
  let inicio = Date.now(), raf = null;
  capa.hidden = false;
  $('#pausa-estado').textContent = t('pausa.regla');
  const reiniciar = (e) => {
    if (e.target.closest('#pausa-salir')) return;
    inicio = Date.now();
    $('#pausa-estado').textContent = t('pausa.reinicio');
  };
  const fin = () => { cancelAnimationFrame(raf); clearInterval(tick); capa.hidden = true; capa.removeEventListener('pointerdown', reiniciar); };
  const ganada = async () => { fin(); await est.ganar(c.id); abrirSobres(); };
  capa.addEventListener('pointerdown', reiniciar);
  $('#pausa-salir').onclick = fin;
  const anillo = $('#pausa-avance');
  const pintar = () => {
    const pasado = Date.now() - inicio, f = Math.min(1, pasado / totalMs);
    anillo.style.strokeDashoffset = String(326.7 * (1 - f));
    const resta = Math.max(0, Math.ceil((totalMs - pasado) / 1000));
    $('#pausa-tiempo').textContent = `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, '0')}`;
    return f >= 1;
  };
  const paso = () => { if (pintar()) { ganada(); return; } raf = requestAnimationFrame(paso); };
  const tick = setInterval(() => { if (pintar()) ganada(); }, 1000);
  raf = requestAnimationFrame(paso);
}

// ---------- Resumen del álbum en la pantalla de Fray ----------
function proximo() {
  const actual = document.body.dataset.estacion || location.hash.replace(/^#\/?/, '');
  const libres = est.cromos().filter((c) => !est.tiene(c.id) && c.como !== 'pausa');
  const c = libres.find((k) => k.estacion === actual) || libres.find((k) => k.como === 'estacion') || libres[0];
  if (!c) return '';
  if (c.estacion && c.estacion === actual) return t('resumen.proxAqui', { nombre: c.nombre });
  if (c.como === 'estacion') return t('resumen.proxEstacion', { nombre: c.nombre, est: est.nombreEstacion(c.estacion) });
  if (c.estacion) return t('resumen.proxPreguntaEst', { nombre: c.nombre, est: est.nombreEstacion(c.estacion) });
  return t('resumen.proxPregunta', { nombre: c.nombre });
}
function pintarResumen() {
  const caja = $('#resumen-album');
  if (!caja) return;
  const n = est.pegados(), tot = est.total(), p = est.pendientes().length;
  caja.innerHTML = `
    <a class="resumen-link" href="#/album">
      <span class="resumen-tit">${esc(t('resumen.titulo'))}</span>
      <span class="resumen-cuenta"><b>${n}</b>/${tot}</span>
      <span class="barra-progreso"><span style="width:${(100 * n) / Math.max(1, tot)}%"></span></span>
    </a>
    ${p ? `<button type="button" class="btn btn-flor resumen-sobres">${esc(p === 1 ? t('resumen.sobre1') : t('resumen.sobres', { n: p }))}</button>` : ''}
    <p class="resumen-pista">${esc(n === tot ? t('pista.fin') : proximo())}</p>
    ${E.nombre ? '' : `<label class="campo-inicio"><span>${esc(t('resumen.nombre'))} <small>(${esc(t('resumen.opcional'))})</small></span>
      <input class="campo-nombre" maxlength="24" autocomplete="given-name" enterkeyhint="done" placeholder="${esc(t('resumen.nombrePh'))}"></label>`}`;
  caja.querySelector('.resumen-sobres')?.addEventListener('click', () => abrirSobres());
  const inp = caja.querySelector('.campo-nombre');
  if (inp) inp.addEventListener('change', () => est.ponerNombre(inp.value));
}

// ---------- Vistas ----------
function entrarVista(v) {
  marcarMuelle(v);
  if (v !== 'guia') salirGuia();
  if (v === 'album') pintarCabezote();
  if (v === 'mapa') pintarMapa(irEstacion);
  if (v === 'guia') {
    if (!pin.sesionActiva()) { location.hash = '#/album'; return; }
    entrarGuia(() => { location.hash = '#/album'; });
  }
}
function marcarMuelle(v) {
  const actual = ['album', 'mapa'].includes(v) ? v : v === 'guia' ? 'ajustes' : 'fray';
  $$('.muelle [data-ir]').forEach((b) => (b.dataset.ir === actual ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
}

// ---------- Nombre, Ajustes, PIN del guía ----------
function pintarNombre() {
  for (const i of $$('.campo-nombre')) if (document.activeElement !== i) i.value = E.nombre;
}

async function pedirPin() {
  const d = $('#dlg-pin');
  const nuevo = !pin.hayPin();
  $('#pin-txt').textContent = nuevo ? t('pin.nuevo') : t('pin.pedir');
  $('#pin-msg').textContent = '';
  $('#pin-in').value = '';
  d.showModal();
  $('#form-pin').onsubmit = async (e) => {
    e.preventDefault();
    const v = $('#pin-in').value.trim();
    try {
      if (nuevo) await pin.definirPin(v);
      else if (!(await pin.comprobarPin(v))) { $('#pin-msg').textContent = t('pin.mal'); return; }
    } catch (err) { $('#pin-msg').textContent = err.message; return; }
    d.close();
    $('#dlg-ajustes').close();
    location.hash = '#/guia';
  };
}

function conectar() {
  bus.addEventListener('cambio', () => { pintarNombre(); if (!document.activeElement?.closest('#resumen-album')) pintarResumen(); if (!$('#vista-mapa').hidden) pintarMapa(irEstacion); });
  bus.addEventListener('capitulo', (e) => {
    const k = est.capitulos().find((c) => c.id === e.detail.cap);
    setTimeout(() => { aviso(t('cel.capitulo', { cap: k.es }), 3500); lluvia(2200); vibrar([60, 60, 60, 60, 120]); }, 400);
  });
  bus.addEventListener('completo', () => setTimeout(() => { lluvia(4200); aviso(`${t('cel.final')} ${t('cel.finalSub')}`, 6000); }, 900));

  for (const i of $$('.campo-nombre')) i.addEventListener('change', () => est.ponerNombre(i.value));
  for (const b of $$('.btn-pdf')) b.onclick = () => botonPDF(b);
  $('#btn-guia').onclick = () => pedirPin();
  $('#pin-cancelar').onclick = () => $('#dlg-pin').close();
  $('#btn-borrar-album').onclick = async () => { if (confirm(t('ajustes.borrarSeguro'))) await est.vaciar(); };
  $('.muelle [data-ir="ajustes"]').onclick = () => $('#dlg-ajustes').showModal();
  // Fray: vuelve a la pantalla principal (conserva la estación elegida)
  const hashActual = () => location.hash.replace(/^#\/?/, '');
  $('.muelle [data-ir="fray"]').onclick = () => { if (['album', 'mapa', 'guia', 'qr'].includes(hashActual())) location.hash = '#/'; };
  window.addEventListener('hashchange', () => { if (!['album', 'mapa', 'guia'].includes(hashActual())) { marcarMuelle('fray'); pintarResumen(); } });
  // Exportar el registro de la prueba (js/registro.js, rama juan/conversacion): si aún no existe, lo dice
  $('#btn-exportar-registro').onclick = async () => {
    const msg = $('#registro-msg');
    try {
      const r = await import('./registro.js');
      if (typeof r.exportarRegistro !== 'function') throw new Error('sin exportarRegistro');
      await r.exportarRegistro();
      msg.textContent = t('registro.listo');
    } catch (e) { console.warn('[registro]', e); msg.textContent = t('registro.noHay'); }
  };
  // Enlace a la APK: solo en un navegador Android (dentro de la APK existe window.FrayNativo)
  const android = /Android/i.test(navigator.userAgent) && !window.FrayNativo;
  for (const a of $$('.enlace-apk')) a.hidden = !android;

  document.addEventListener('fray:vista', (e) => listo.then(() => entrarVista(e.detail.vista)));
  document.addEventListener('fray:respuesta', (e) => alResponder(e.detail || {}).catch((err) => console.warn('[album]', err)));
  document.addEventListener('fray:qr-guia', async (e) => {
    await listo;
    const r = await leerQR(e.detail.texto).catch(() => null);
    if (!r) { aviso(t('guia.ajeno')); return; }
    if (r.vencido) { aviso(t('guia.vencido')); return; }
    const res = await aplicar(r);
    location.hash = '#/album';
    if (res.ganado) abrirSobres(); else aviso(t(res.msg), 3500);
  });
  // Vista actual al arrancar (si se abrió directo en #/album, #/mapa…)
  const h = location.hash.replace(/^#\/?/, '');
  entrarVista(['album', 'mapa', 'guia'].includes(h) ? h : 'fray');
  window.__album = { E, est, abrirSobres, abrirDetalle, cerrarDetalle, animar };
}
