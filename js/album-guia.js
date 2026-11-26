// Modo guía (de espeletia-ai/js/guia.js): el guía entrega cromos y confirmaciones sin internet.
// Su teléfono muestra un QR y un código de 4 dígitos que cambian cada 5 minutos: firma HMAC-SHA256 de «qué se entrega» +
// «franja de tiempo», con la clave de QR del paquete (o la de DEMOSTRACIÓN, ver js/ui-motor.js). El visitante escribe el
// código (o escanea el QR con «Escanear el QR de la estación»); su teléfono lo verifica con el reloj local. Cada código sirve
// una vez por teléfono. Se entra desde Ajustes con el PIN del dispositivo (mismo esquema PBKDF2 que el Panel, js/panel-pin.js).
//
// Acciones:  h:<cromo>     entrega un cromo que se gana preguntando (cuando Fray no lo da)
//            e:<estación>  «llegamos a esta estación» (si el QR o Fray fallan): da el cromo de la estación
//            aqui          «estamos en el parque»: habilita la pausa
import { E, cromos, cromo, tiene, ganar, visitar, marcarAqui, guardar, estaciones, cromoDeEstacion, nombreEstacion } from './album-estado.js';
import { claveQR } from './ui-motor.js';
import { t } from './album-textos.js';
import { $, $$, h, esc, aviso, vibrar, animar } from './album-util.js';

const enc = new TextEncoder();
const FRANJA_MS = 5 * 60000;
const VENTANA = [-2, -1, 0, 1]; // ~10 min hacia atrás y 1 franja adelante (relojes desfasados)
export const PREFIJO = 'FRAYG1';
let llave = null, llaveDe = null;

export const franja = (ms = Date.now()) => Math.floor(ms / FRANJA_MS);
async function hmac(txt) {
  const clave = await claveQR(E.paquete);
  if (!clave) throw new Error('sin clave');
  if (llaveDe !== clave) { llave = await crypto.subtle.importKey('raw', enc.encode(`guia|${clave}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); llaveDe = clave; }
  const s = await crypto.subtle.sign('HMAC', llave, enc.encode(txt));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const firma = async (accion, f) => (await hmac(`${accion}|${f}`)).slice(0, 12);
export async function codigo(accion, f = franja()) {
  const x = await hmac(`cod|${accion}|${f}`);
  return String(parseInt(x.slice(0, 8), 16) % 10000).padStart(4, '0');
}
export async function contenidoQR(accion, f = franja()) { return `${PREFIJO}|${accion}|${f}|${await firma(accion, f)}`; }
export const esDelGuia = (txt) => typeof txt === 'string' && txt.startsWith(`${PREFIJO}|`);

export async function leerQR(txt) {
  const p = String(txt).trim().split('|');
  if (p.length !== 4 || p[0] !== PREFIJO) return null;
  const [, accion, fs, sig] = p;
  const f = Number(fs);
  if (!Number.isInteger(f) || (await firma(accion, f)) !== sig) return null;
  if (!VENTANA.includes(f - franja())) return { vencido: true };
  return { accion, f };
}
async function leerCodigo(accion, cod) {
  const a = franja();
  for (const d of VENTANA) if ((await codigo(accion, a + d)) === cod) return { accion, f: a + d };
  return null;
}

// 5 fallos seguidos bloquean 1 minuto (luego 2, 4…)
const LS = 'fray-album-intentos';
const leerInt = () => { try { return JSON.parse(localStorage.getItem(LS)) || { n: 0, hasta: 0, nivel: 0 }; } catch { return { n: 0, hasta: 0, nivel: 0 }; } };
const guardarInt = (x) => { try { localStorage.setItem(LS, JSON.stringify(x)); } catch { /* */ } };
const esperaSegundos = () => Math.max(0, Math.ceil((leerInt().hasta - Date.now()) / 1000));
function fallo() {
  const x = leerInt();
  x.n++;
  if (x.n >= 5) { x.hasta = Date.now() + 60000 * 2 ** x.nivel; x.nivel = Math.min(x.nivel + 1, 4); x.n = 0; }
  guardarInt(x);
}
const acierto = () => guardarInt({ n: 0, hasta: 0, nivel: 0 });

/** Aplica lo que entrega el guía. Devuelve { ganado: id } o { msg }. */
export async function aplicar({ accion, f }) {
  const marca = `${accion}|${f}`;
  if (E.usados.includes(marca)) return { msg: 'guia.usado' };
  const [tipo, arg] = accion.split(':');
  let r;
  if (tipo === 'h') {
    const c = cromo(arg);
    if (!c || c.como === 'estacion') return { msg: 'guia.ajeno' };
    r = tiene(c.id) ? { msg: 'guia.repetido' } : (await ganar(c.id), { ganado: c.id });
  } else if (tipo === 'e') {
    await visitar(arg);
    await marcarAqui();
    const c = cromoDeEstacion(arg);
    r = c && !tiene(c.id) ? (await ganar(c.id, { estacionId: arg }), { ganado: c.id }) : { msg: 'guia.aqui' };
  } else if (tipo === 'aqui') {
    await marcarAqui();
    r = { msg: 'guia.aqui' };
  } else return { msg: 'guia.ajeno' };
  E.usados.push(marca);
  await guardar();
  return r;
}

export function formCodigo(accion, alResultado) {
  const f = h(`<form class="codigo" autocomplete="off">
      <label class="codigo-et">${esc(t('codigo.etiqueta'))}</label>
      <div class="codigo-fila">
        <input inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="• • • •" enterkeyhint="done" aria-label="${esc(t('codigo.etiqueta'))}">
        <button class="btn btn-flor">${esc(t('codigo.ok'))}</button>
      </div>
    </form>`);
  const inp = $('input', f);
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (esperaSegundos()) { aviso(t('codigo.espera', { s: esperaSegundos() }), 3500); return; }
    const v = inp.value.trim();
    let ok = null;
    try { ok = /^\d{4}$/.test(v) && (await leerCodigo(accion, v)); } catch { ok = null; }
    if (ok) { acierto(); alResultado(await aplicar(ok)); return; }
    fallo();
    aviso(esperaSegundos() ? t('codigo.espera', { s: esperaSegundos() }) : t('codigo.mal'), 3500);
    vibrar([40, 40, 40]);
    animar(inp, [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 300 });
    inp.select();
  };
  return f;
}

// ---------- Pantalla del guía ----------
let reloj = null, despierto = null, sel = null, ultimaF = null;

function opciones() {
  return {
    historias: cromos().filter((c) => c.como === 'pregunta').map((c) => ({ accion: `h:${c.id}`, nombre: `${String(c.n).padStart(2, '0')}. ${c.nombre}` })),
    estaciones: estaciones().map((e) => ({ accion: `e:${e.id}`, nombre: e.nombre })),
    aqui: [{ accion: 'aqui', nombre: t('guiaV.aquiNombre') }],
  };
}

export async function entrarGuia(alSalir) {
  const v = $('#vista-guia');
  const op = opciones();
  const todas = Object.values(op).flat();
  sel = todas.find((o) => o.accion === sel?.accion) || todas[0];
  const grupo = (clave, lista) => `<fieldset class="guia-grupo"><legend>${esc(t(`guiaV.g.${clave}`))}</legend><div class="guia-ops">${lista.map((o) => `<button type="button" data-a="${esc(o.accion)}" aria-pressed="${o.accion === sel.accion}">${esc(o.nombre)}</button>`).join('')}</div></fieldset>`;
  v.innerHTML = `<div class="guia">
      <header class="campo-cab"><h2>${esc(t('guiaV.titulo'))}</h2><button class="btn btn-linea btn-mini" id="guia-salir">${esc(t('guiaV.salir'))}</button></header>
      <p class="sub">${esc(t('guiaV.sub'))}</p>
      <figure class="guia-tarjeta" aria-live="polite">
        <figcaption class="guia-que"></figcaption>
        <div class="guia-qr"></div>
        <p class="guia-cod-et">${esc(t('guiaV.oCodigo'))}</p>
        <p class="guia-cod"></p>
        <p class="guia-cambia"><span class="guia-barra"><i></i></span><span class="guia-resta"></span></p>
      </figure>
      ${grupo('estaciones', op.estaciones)}${grupo('historias', op.historias)}${grupo('aqui', op.aqui)}
      <p class="sub guia-nota">${esc(t('guiaV.nota'))}</p>
    </div>`;
  $('#guia-salir').onclick = () => { salirGuia(); alSalir?.(); };
  $$('.guia-ops button', v).forEach((b) => (b.onclick = () => {
    sel = todas.find((o) => o.accion === b.dataset.a);
    $$('.guia-ops button', v).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    ultimaF = null; pintar();
    $('.guia-tarjeta', v).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  ultimaF = null;
  await pintar();
  clearInterval(reloj);
  reloj = setInterval(pintar, 1000);
  try { despierto = await navigator.wakeLock?.request('screen'); } catch { /* sin permiso */ }
}

export function salirGuia() { clearInterval(reloj); reloj = null; try { despierto?.release(); } catch { /* */ } despierto = null; }

async function pintar() {
  const v = $('#vista-guia');
  if (!v || v.hidden || !$('.guia-resta', v)) return;
  const ahora = Date.now(), f = franja(ahora);
  const resta = Math.ceil(((f + 1) * FRANJA_MS - ahora) / 1000);
  $('.guia-resta', v).textContent = t('guiaV.cambia', { t: `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, '0')}` });
  $('.guia-barra i', v).style.transform = `scaleX(${resta / (FRANJA_MS / 1000)})`;
  if (f === ultimaF) return;
  ultimaF = f;
  try {
    const qrTxt = await contenidoQR(sel.accion, f);
    if (window.qrcode) {
      const q = window.qrcode(0, 'M'); q.addData(qrTxt); q.make();
      $('.guia-qr', v).innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    }
    $('.guia-que', v).textContent = sel.nombre;
    $('.guia-cod', v).textContent = (await codigo(sel.accion, f)).split('').join(' ');
  } catch { $('.guia-que', v).textContent = t('guia.ajeno'); }
}

export { nombreEstacion };
