// Utilidades compartidas: selección, avisos, vibración, voz y animación.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
export function aviso(msg, ms = 3000) {
  const t = $('#aviso');
  t.textContent = msg;
  t.classList.add('ver');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('ver'), ms);
}

let puedeVibrar = false;
addEventListener('pointerdown', () => { puedeVibrar = true; }, { once: true, capture: true });
export function vibrar(p = 60) {
  if (!puedeVibrar || localStorage.getItem('vibrar') === '0') return;
  try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* sin soporte */ }
}

// Voz del sistema (funciona sin internet con las voces instaladas en el celular).
export function hablar(texto, lang = 'es') {
  if (!('speechSynthesis' in window) || localStorage.getItem('voz') === '0') return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  const voces = speechSynthesis.getVoices();
  const pref = lang === 'en' ? [/^en(-|_)US/i, /^en/i] : [/^es(-|_)CO/i, /^es(-|_)(419|MX|US)/i, /^es/i];
  let voz;
  for (const r of pref) { voz = voces.find((v) => r.test(v.lang)); if (voz) break; }
  if (voz) u.voice = voz;
  u.lang = voz ? voz.lang : (lang === 'en' ? 'en-US' : 'es-CO');
  u.rate = 0.97;
  speechSynthesis.speak(u);
}
export const callar = () => { try { speechSynthesis.cancel(); } catch (e) { /* */ } };

// Animación con Web Animations API; respeta "reducir movimiento".
export function animar(el, frames, opts) {
  if (!el) return Promise.resolve();
  if (reducido()) {
    const ultimo = Array.isArray(frames) ? frames[frames.length - 1] : null;
    if (ultimo && opts && opts.fill && opts.fill !== 'none') Object.assign(el.style, ultimo);
    return Promise.resolve();
  }
  const a = el.animate(frames, opts);
  return a.finished.catch(() => {});
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, reducido() ? Math.min(ms, 60) : ms));

export function distancia(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function fmtDist(m, lang = 'es') {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  const km = (m / 1000).toFixed(1);
  return `${lang === 'es' ? km.replace('.', ',') : km} km`;
}

// Mantiene el foco dentro de un diálogo modal construido a mano.
export function atraparFoco(cont) {
  const f = () => $$('button:not([disabled]):not([hidden]), input:not([hidden]), [tabindex="0"]', cont).filter((e) => e.offsetParent !== null);
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const l = f(); if (!l.length) return;
    const i = l.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); l[l.length - 1].focus(); }
    else if (!e.shiftKey && i === l.length - 1) { e.preventDefault(); l[0].focus(); }
  };
  cont.addEventListener('keydown', onKey);
  return () => cont.removeEventListener('keydown', onKey);
}
