// Animación del sobre (copiada y simplificada de legado/album/js/sobre.js): el sobre entra, se abre con un toque,
// deslizando o con Enter, sale el cromo con el sello de la estación y aparece el texto del guion con su cita.
// Sin sonido. Con «menos movimiento» todo es un fundido corto. Devuelve una promesa que se cumple al «Pegar».

import { ilustracion, silueta } from './cromos-arte.js';

const LIBRO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM6 4h5v8l-2.5-1.5L6 12z"/></svg>';

export const reducido = () => document.documentElement.dataset.movimiento === 'reducido'
  || matchMedia('(prefers-reduced-motion: reduce)').matches;

// Tono por estación para los cromos por descubrir: [sombra, medio, luz, brillo]. Cada foto se posteriza en estos 4 tonos.
export const TONOS = {
  brisas: ['#13263a', '#2f5d86', '#7fb0d6', '#e4f1fb'],
  aguacerales: ['#0e2b2d', '#286c6f', '#7cc1bf', '#e3f5f1'],
  arenales: ['#2c1d10', '#86572a', '#d9a964', '#fbeed6'],
  lunares: ['#29110e', '#8a3a29', '#e08a64', '#fde6da'],
  tumbas: ['#1b1430', '#57408a', '#a98bd6', '#efe6fb'],
  paso: ['#0f1f2d', '#2d4e72', '#8fb6d9', '#eaf3fb'],
};
const tonoDe = (c) => (TONOS[c.estacion] ? c.estacion : 'paso');

// Filtros SVG (duotono posterizado) que se ponen una sola vez en la página: filter: url(#sc-duo-<tono>)
function asegurarFiltros() {
  if (document.getElementById('sc-filtros')) return;
  const canal = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  const filtros = Object.entries(TONOS).map(([k, t]) => {
    // 3 tonos (sombra, medio, luz): formas planas y limpias, sin el ruido de la foto
    const tabla = (i) => [t[0], t[1], t[2]].map((h) => canal(h, i).toFixed(3)).join(' ');
    return `<filter id="sc-duo-${k}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
      <feColorMatrix type="saturate" values="0"/><feGaussianBlur stdDeviation="3.2"/>
      <feComponentTransfer><feFuncR type="linear" slope="1.5" intercept="-.2"/><feFuncG type="linear" slope="1.5" intercept="-.2"/><feFuncB type="linear" slope="1.5" intercept="-.2"/></feComponentTransfer>
      <feComponentTransfer><feFuncR type="discrete" tableValues="${tabla(0)}"/><feFuncG type="discrete" tableValues="${tabla(1)}"/>
      <feFuncB type="discrete" tableValues="${tabla(2)}"/></feComponentTransfer></filter>`;
  }).join('');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'sc-filtros'; svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  svg.innerHTML = filtros;
  document.body.append(svg);
}

// Destellos angulares (rayo, arco y astillas) sobre el panel de un cromo por descubrir
const RAYOS = `<svg class="sc-rayos" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <circle cx="72" cy="38" r="30" fill="none" stroke="currentColor" stroke-width="5" opacity=".22"/>
  <path d="M0 64 L44 50 L37 58 L100 30 L100 38 L50 60 L57 52 L0 74Z" fill="currentColor" opacity=".26"/>
  <path d="M0 84 L30 76 L26 81 L64 70 L18 90 L22 85 L0 90Z" fill="currentColor" opacity=".16"/>
  <path d="M8 0 L20 0 L4 40 L0 40Z" fill="currentColor" opacity=".10"/>
</svg>`;

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
function animar(el, frames, opciones) {
  if (!el.animate) return Promise.resolve();
  return el.animate(frames, { fill: 'forwards', ...opciones }).finished.catch(() => {});
}
function nodo(etiqueta, clase, texto) {
  const n = document.createElement(etiqueta);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = texto;
  return n;
}
const num = (n) => String(n).padStart(2, '0');

/**
 * Frente del cromo: una copia fotográfica de exposición (passe-partout, foto, número, nombre y crédito del fotógrafo)
 * con el sello de la estación y la altitud. Bloqueado: la silueta del tema y la pista de dónde se gana.
 */
export function cromoFrente(c, { numero, estacion, altitud, foto, bloqueado = false, pista = '' }) {
  const el = nodo('div', `sc-cromo${bloqueado ? ' bloqueado' : ''}`);
  el.setAttribute('aria-hidden', 'true'); // el texto accesible va en la lámina, el título o la etiqueta del álbum
  const img = nodo('div', 'sc-imagen');
  if (bloqueado) {
    // Por descubrir: la misma foto en duotono del color de su estación, con destellos; sin foto, la silueta dibujada
    asegurarFiltros();
    el.dataset.tono = tonoDe(c);
    const t = TONOS[tonoDe(c)];
    el.style.cssText = `--t0:${t[0]};--t1:${t[1]};--t2:${t[2]};--t3:${t[3]}`;
    if (foto?.src) {
      const im = nodo('img', 'sc-duo');
      im.src = foto.src; im.alt = ''; im.decoding = 'async';
      im.style.filter = `url(#sc-duo-${tonoDe(c)})`;
      im.onerror = () => { im.replaceWith(document.createRange().createContextualFragment(silueta(c.id))); };
      img.append(im);
    } else img.innerHTML = silueta(c.id);
    img.insertAdjacentHTML('beforeend', RAYOS);
  } else if (foto?.src) {
    const im = nodo('img');
    im.src = foto.src; im.alt = ''; im.decoding = 'async';
    im.onerror = () => { img.innerHTML = ilustracion(c.id); }; // sin la foto queda el dibujo
    img.append(im);
  } else img.innerHTML = ilustracion(c.id);
  el.append(img, nodo('span', 'sc-num', num(numero)), nodo('span', 'sc-nombre', bloqueado ? '? ? ?' : c.nombre));
  if (bloqueado && pista) el.append(nodo('span', 'sc-pista', pista));
  if (!bloqueado && foto?.autor) el.append(nodo('span', 'sc-credito', `© ${foto.autor} · ${foto.licencia}`));
  if (!bloqueado && (estacion || altitud)) {
    const s = nodo('span', 'sc-sello');
    if (altitud) s.append(nodo('b', null, `${altitud.toLocaleString('es-CO')} m`));
    if (estacion) s.append(nodo('i', null, estacion));
    el.append(s);
  }
  return el;
}

/** Lámina con el dato literal del guion, la etiqueta de relato si corresponde y la cita visible. */
export function lamina(c, d) {
  const { cita, tx } = d;
  const l = nodo('div', 'sc-lamina');
  const et = c.tipo === 'relato' ? nodo('p', 'sc-et relato', tx.relato) : nodo('p', 'sc-et', tx.datoGuion);
  const p = nodo('p', 'sc-cita');
  p.innerHTML = LIBRO;
  p.append(cita);
  l.append(et, nodo('p', 'sc-dato', c.dato), p);
  if (d.foto?.autor) l.append(nodo('p', 'sc-foto-credito', d.tx.fotoDe(d.foto)));
  return l;
}

/**
 * Pinta y anima la apertura dentro de `dialogo` (un <dialog> ya abierto).
 * datos: { cromo, numero, estacion, altitud, cita, repetido, quedan, tx }
 */
export async function revelar(dialogo, d) {
  const { cromo: c, tx } = d;
  const escena = nodo('div', 'sc-escena');
  const titulo = nodo('h2', 'sc-titulo', d.repetido ? tx.yaLoTienes : tx.sobreDe(d.estacion));
  titulo.id = 'sc-titulo';
  const mesa = nodo('div', 'sc-mesa');
  const card = cromoFrente(c, d);
  escena.append(titulo, mesa);
  dialogo.replaceChildren(escena);
  dialogo.setAttribute('aria-labelledby', 'sc-titulo');

  // Ya lo tiene: se muestra el cromo quieto con su texto, sin la animación del sobre
  if (d.repetido) {
    mesa.append(card);
    return mostrarTexto(escena, card, d, { soloCerrar: true });
  }

  const sobre = nodo('button', 'sc-sobre');
  sobre.type = 'button';
  sobre.setAttribute('aria-label', tx.abrir);
  sobre.innerHTML = `<span class="sc-sobre-cuerpo"><span class="sc-sobre-arte" aria-hidden="true"></span>
      <span class="sc-sobre-marca"></span><span class="sc-sobre-est"></span></span><span class="sc-tira" aria-hidden="true"></span>`;
  const arte = sobre.querySelector('.sc-sobre-arte');
  if (d.foto?.src) {
    asegurarFiltros();
    const im = nodo('img', 'sc-duo');
    im.src = d.foto.src; im.alt = ''; im.style.filter = `url(#sc-duo-${tonoDe(c)})`;
    arte.append(im);
  } else arte.innerHTML = silueta(c.id);
  sobre.querySelector('.sc-sobre-marca').textContent = tx.marca;
  sobre.querySelector('.sc-sobre-est').textContent = d.estacion || tx.parque;
  card.classList.add('oculto');
  mesa.append(card, sobre);
  // Un toque basta (con guantes), aunque el sobre todavía esté entrando. Deslizar encima también abre; Enter o Espacio, con teclado.
  const tocado = new Promise((ok) => { sobre.onclick = ok; });
  const ayuda = nodo('p', 'sc-ayuda', tx.ayuda);
  escena.append(ayuda);

  const quieto = reducido();
  if (quieto) await animar(sobre, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
  else {
    await animar(sobre, [{ transform: 'translateY(50vh) rotate(-8deg)', opacity: 0 }, { transform: 'translateY(0) rotate(-2deg)', opacity: 1 }],
      { duration: 520, easing: 'cubic-bezier(.2,.9,.25,1.1)' });
    sobre.animate?.([{ transform: 'rotate(-2deg)' }, { transform: 'rotate(1.5deg)' }, { transform: 'rotate(-2deg)' }],
      { duration: 1600, iterations: Infinity, easing: 'ease-in-out' });
  }
  sobre.focus({ preventScroll: true });

  await tocado;
  sobre.onclick = null;
  sobre.getAnimations?.().forEach((a) => a.cancel());
  navigator.vibrate?.(40);
  ayuda.remove();

  card.classList.remove('oculto');
  if (quieto) {
    await animar(sobre, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
    sobre.remove();
    await animar(card, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
  } else {
    // Rasgar: la tira sale volando, el cromo sube y el sobre cae
    animar(sobre.querySelector('.sc-tira'), [{ transform: 'none', opacity: 1 }, { transform: 'translate(110px,-130px) rotate(28deg)', opacity: 0 }],
      { duration: 480, easing: 'cubic-bezier(.3,.6,.4,1)' });
    await esperar(100);
    await Promise.all([
      animar(card, [{ transform: 'translateY(24%)' }, { transform: 'translateY(-30%)' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' }),
      animar(sobre, [{ transform: 'rotate(-2deg)' }, { transform: 'translateY(8%) rotate(-2deg)' }], { duration: 520 }),
    ]);
    await Promise.all([
      animar(sobre, [{ transform: 'translateY(8%) rotate(-2deg)', opacity: 1 }, { transform: 'translateY(80vh) rotate(10deg)', opacity: 0 }],
        { duration: 440, easing: 'cubic-bezier(.6,0,.8,.4)' }),
      animar(card, [{ transform: 'translateY(-30%)' }, { transform: 'none' }], { duration: 440, easing: 'cubic-bezier(.3,1.3,.5,1)' }),
    ]);
    sobre.remove();
  }
  titulo.textContent = tx.nuevo;
  titulo.classList.add('listo');
  return mostrarTexto(escena, card, d, { soloCerrar: false });
}

async function mostrarTexto(escena, card, d, { soloCerrar }) {
  const { tx } = d;
  const lam = lamina(d.cromo, d);
  const acc = nodo('div', 'sc-acciones');
  const boton = nodo('button', 'btn btn-flor', soloCerrar ? tx.cerrar : tx.pegar);
  boton.type = 'button';
  acc.append(boton);
  escena.classList.add('con-texto');
  escena.append(lam, acc);
  if (d.quedan > 0) escena.append(nodo('p', 'sc-otro', tx.quedan(d.quedan)));
  const fundido = reducido() ? 160 : 260;
  await Promise.all([lam, acc].map((x) => animar(x, [{ opacity: 0, transform: reducido() ? 'none' : 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: fundido })));
  boton.focus({ preventScroll: true });
  await new Promise((ok) => { boton.onclick = ok; });
  if (!soloCerrar && !reducido()) {
    // «Pegado»: el cromo se hunde un poco, como al presionarlo contra la hoja
    await animar(card, [{ transform: 'none' }, { transform: 'scale(.92) rotate(-2deg)' }, { transform: 'scale(.96) rotate(-2deg)', opacity: 0 }], { duration: 320, easing: 'ease-in' });
  }
}

/**
 * Álbum: los cromos en cuadrícula. Los ganados muestran su foto; los que faltan, la silueta y la estación donde se ganan.
 * datos: { items: [{ cromo, numero, estacion, altitud, foto, ganado }], tx, alAbrir(item) }. Se cumple al cerrar.
 */
export function album(dialogo, { items, tx, alAbrir }) {
  const escena = nodo('div', 'sc-escena sc-album');
  const titulo = nodo('h2', 'sc-titulo listo', tx.album);
  titulo.id = 'sc-titulo';
  const cuenta = nodo('p', 'sc-ayuda', tx.cuenta(items.filter((i) => i.ganado).length, items.length));
  const rejilla = nodo('ul', 'sc-rejilla');
  for (const it of items) {
    const li = nodo('li');
    const b = nodo('button', 'sc-celda');
    b.type = 'button';
    b.append(cromoFrente(it.cromo, { ...it, bloqueado: !it.ganado, pista: it.estacion ? tx.seGanaEn(it.estacion) : tx.seGanaPaso }));
    b.setAttribute('aria-label', it.ganado ? `${num(it.numero)}. ${it.cromo.nombre}` : `${num(it.numero)}. ${tx.bloqueado}. ${it.estacion ? tx.seGanaEn(it.estacion) : tx.seGanaPaso}`);
    if (it.ganado) b.onclick = () => alAbrir(it);
    else b.setAttribute('aria-disabled', 'true');
    li.append(b);
    rejilla.append(li);
  }
  const acc = nodo('div', 'sc-acciones');
  const cerrar = nodo('button', 'btn btn-flor', tx.cerrar);
  cerrar.type = 'button';
  cerrar.onclick = () => dialogo.close();
  acc.append(cerrar);
  escena.append(titulo, cuenta, rejilla, acc);
  dialogo.replaceChildren(escena);
  dialogo.setAttribute('aria-labelledby', 'sc-titulo');
  cerrar.focus({ preventScroll: true });
}
