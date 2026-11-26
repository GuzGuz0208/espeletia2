// Cromos de estación (spec docs/specs/cromos.md). Módulo independiente de la interfaz: escucha el evento global
//   document.dispatchEvent(new CustomEvent('fray:cromo', { detail: { id } }))          → ese cromo
//   document.dispatchEvent(new CustomEvent('fray:cromo', { detail: { estacion } }))    → el siguiente cromo de la estación
// y abre el sobre de la demostración. Guarda solo los ids ganados (sin datos personales).
// Los textos son literales de los guiones (contenido/cromos.json) y siguen la vigencia del contenido (contrato §7).
//
//   import { abrirSobre, ganados, total } from './js/cromos-demo.js';
//   await abrirSobre('aguacerales-frailejon');  // si ya lo tiene: «Ya lo tienes», sin repetir la animación
//   await abrirAlbum();                         // o el evento 'fray:album': los 10 cromos, los que faltan en silueta
// Fotos: img/cromos/<id>.jpg (Wikimedia Commons; autor y licencia en img/cromos/creditos.json, se muestran en el cromo).

import * as vig from './vigencia.js';
import { paqueteBase } from './ui-paquete.js';
import { revelar, album } from './sobre-demo.js';

const CLAVE = 'fray-cromos-demo-ganados';
let ids;
try { ids = new Set(JSON.parse(localStorage.getItem(CLAVE) || '[]')); }
catch { ids = new Set(); }

export const ganados = () => [...ids];
export const total = () => ids.size;

/** Solo para pruebas (cromos.html): olvida los cromos de este dispositivo. */
export function olvidar() {
  ids.clear();
  try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
}

// Estilos propios: se cargan solos para no tocar index.html
if (!document.querySelector('link[data-cromos]')) {
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = new URL('../css/cromos.css', import.meta.url).href; l.dataset.cromos = '';
  document.head.append(l);
}

const TX = {
  es: {
    marca: 'Fray', parque: 'PNN Los Nevados', sobreDe: (e) => (e ? `Sobre de ${e}` : 'Sobre del páramo'),
    abrir: 'Abrir el sobre', ayuda: 'Toca el sobre para abrirlo', nuevo: '¡Cromo nuevo!', yaLoTienes: 'Ya lo tienes',
    pegar: 'Pegar', cerrar: 'Cerrar', datoGuion: 'Dato del guion', relato: 'Relato de tradición oral',
    quedan: (n) => (n === 1 ? 'Hay otro sobre esperando.' : `Hay ${n} sobres esperando.`),
    fotoDe: (f) => `Foto: ${f.autor} · ${f.licencia} · Wikimedia Commons`,
    album: 'Mis cromos', cuenta: (g, n) => `${g} de ${n}`, bloqueado: 'Por descubrir',
    seGanaEn: (e) => `Se gana en ${e}`, seGanaPaso: 'Se gana en el recorrido', tuCromo: 'Tu cromo', volver: 'Volver al álbum',
  },
  en: {
    marca: 'Fray', parque: 'Los Nevados NP', sobreDe: (e) => (e ? `${e} pack` : 'Páramo pack'),
    abrir: 'Open the pack', ayuda: 'Tap the pack to open it', nuevo: 'New card!', yaLoTienes: 'You already have it',
    pegar: 'Stick it', cerrar: 'Close', datoGuion: 'From the official script (in Spanish)', relato: 'Oral tradition',
    quedan: (n) => (n === 1 ? 'Another pack is waiting.' : `${n} packs are waiting.`),
    fotoDe: (f) => `Photo: ${f.autor} · ${f.licencia} · Wikimedia Commons`,
    album: 'My cards', cuenta: (g, n) => `${g} of ${n}`, bloqueado: 'Still hidden',
    seGanaEn: (e) => `Earned at ${e}`, seGanaPaso: 'Earned along the trail', tuCromo: 'Your card', volver: 'Back to the album',
  },
};
const textos = () => TX[document.documentElement.lang === 'en' ? 'en' : 'es'];

// ---------- Datos ----------
async function leerCromos() {
  const r = await fetch(new URL('../contenido/cromos.json', import.meta.url));
  if (!r.ok) throw new Error(`cromos.json: ${r.status}`);
  return r.json();
}
let creditos = null; // { id: { autor, licencia, … } } de img/cromos/creditos.json
async function leerCreditos() {
  if (creditos) return creditos;
  try { creditos = (await (await fetch(new URL('../img/cromos/creditos.json', import.meta.url))).json()).fotos || {}; }
  catch { creditos = {}; }
  return creditos;
}
function foto(id) {
  const f = creditos?.[id];
  return f ? { src: new URL(`../img/cromos/${id}.jpg`, import.meta.url).href, autor: f.autor, licencia: f.licencia } : null;
}
let estaciones = null; // { id: { nombre, m } } desde el paquete (altitud citada del guion); si falla, el sello lleva solo el nombre
async function leerEstaciones() {
  if (estaciones) return estaciones;
  try {
    const { paquete } = await paqueteBase();
    estaciones = Object.fromEntries((paquete.estaciones || []).map((e) => [e.id, { nombre: e.nombre, m: e.altitud?.m ?? null }]));
  } catch { estaciones = {}; }
  return estaciones;
}

/** El siguiente cromo que da una estación: el primero que falta de ella; si ya tiene todos, uno sin estación (el cóndor). */
export function siguienteDe(estacion, cromos) {
  const deEstacion = cromos.filter((c) => c.estacion === estacion);
  return deEstacion.find((c) => !ids.has(c.id)) || cromos.find((c) => !c.estacion && !ids.has(c.id)) || deEstacion[0] || null;
}

// ---------- Cola de sobres ----------
const cola = [];
let mostrando = false;
let dialogo;

vig.alCambiar(({ vigente }) => {
  if (vigente) return;
  cola.length = 0;
  if (dialogo?.open) dialogo.close();
  dialogo?.replaceChildren();
});

export async function abrirSobre(id) {
  if (!id || cola.includes(id)) return;
  cola.push(id);
  if (mostrando) return;
  mostrando = true;
  try {
    while (cola.length && vig.verificarVigencia().vigente) await mostrar(cola.shift());
  } finally {
    cola.length = 0;
    mostrando = false;
  }
}

async function mostrar(id) {
  const { cromos, fuentes } = await leerCromos();
  const i = cromos.findIndex((c) => c.id === id);
  if (i < 0 || !vig.verificarVigencia().vigente) return;
  const c = cromos[i];
  const est = c.estacion ? (await leerEstaciones())[c.estacion] : null;
  await leerCreditos();
  crearDialogo();
  const repetido = ids.has(id);
  const cerrado = new Promise((ok) => dialogo.addEventListener('close', ok, { once: true }));
  dialogo.showModal();
  // Escape (o la vigencia que vence) cierra el diálogo: en ese caso el cromo no se pega
  const final = await Promise.race([
    revelar(dialogo, {
      cromo: c,
      numero: i + 1,
      estacion: est?.nombre || null,
      altitud: est?.m || null,
      cita: `${fuentes[c.cita.guion] || c.cita.guion} · p. ${c.cita.pagina}`,
      foto: foto(c.id),
      repetido,
      quedan: cola.length,
      tx: textos(),
    }).then(() => 'pegar'),
    cerrado.then(() => 'cerrado'),
  ]);
  if (final === 'pegar' && !repetido && vig.verificarVigencia().vigente) {
    ids.add(id);
    try { localStorage.setItem(CLAVE, JSON.stringify(ganados())); } catch { /* queda solo en esta sesión */ }
    document.dispatchEvent(new CustomEvent('fray:cromo-pegado', { detail: { id, total: ids.size, de: cromos.length } }));
  }
  if (dialogo.open) dialogo.close();
  await cerrado;
  dialogo.replaceChildren();
}

function crearDialogo() {
  if (dialogo) return;
  dialogo = document.createElement('dialog');
  dialogo.className = 'sobre-cromo';
  document.body.append(dialogo);
}

/** Abre el álbum: los cromos ganados con su foto y los que faltan en silueta. Tocar uno ganado lo muestra en grande. */
export async function abrirAlbum() {
  if (mostrando || !vig.verificarVigencia().vigente) return;
  mostrando = true;
  try {
    const [{ cromos, fuentes }, est] = await Promise.all([leerCromos(), leerEstaciones(), leerCreditos()]);
    crearDialogo();
    const items = cromos.map((c, i) => ({
      cromo: c, numero: i + 1, estacion: est[c.estacion]?.nombre || null, altitud: est[c.estacion]?.m || null,
      foto: foto(c.id), ganado: ids.has(c.id), cita: `${fuentes[c.cita.guion] || c.cita.guion} · p. ${c.cita.pagina}`,
    }));
    const cerrado = new Promise((ok) => dialogo.addEventListener('close', ok, { once: true }));
    const pintar = () => album(dialogo, {
      items, tx: textos(),
      alAbrir: async (it) => {
        const tx = { ...textos(), yaLoTienes: textos().tuCromo, cerrar: textos().volver };
        await Promise.race([revelar(dialogo, { ...it, repetido: true, quedan: 0, tx }), cerrado]);
        if (dialogo.open) pintar();
      },
    });
    dialogo.showModal();
    pintar();
    await cerrado;
    dialogo.replaceChildren();
  } finally {
    mostrando = false;
    // Un sobre que llegó con el álbum abierto se abre ahora
    if (cola.length) abrirSobre(cola.shift());
  }
}
document.addEventListener('fray:album', () => { abrirAlbum().catch((error) => console.warn('[cromos]', error)); });

document.addEventListener('fray:cromo', (evento) => {
  const { id, estacion } = evento.detail || {};
  const abrir = id ? Promise.resolve(id)
    : estacion ? leerCromos().then(({ cromos }) => siguienteDe(estacion, cromos)?.id) : Promise.resolve(null);
  abrir.then((x) => abrirSobre(x)).catch((error) => console.warn('[cromos]', error));
});
