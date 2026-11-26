// Utilidades del álbum (de espeletia-ai/js/util.js): selección, avisos, vibración, voz local y animación.
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
export function aviso(msg, ms = 3200) {
  const t = $('#album-aviso');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('ver');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('ver'), ms);
}

let puedeVibrar = false;
addEventListener('pointerdown', () => { puedeVibrar = true; }, { once: true, capture: true });
export function vibrar(p = 60) {
  if (!puedeVibrar) return;
  try { navigator.vibrate && navigator.vibrate(p); } catch { /* sin soporte */ }
}

// Voz del sistema: solo voces locales del teléfono (sin red). Sin sonido si no las hay.
export function hablar(texto) {
  if (!('speechSynthesis' in window)) return;
  const voces = speechSynthesis.getVoices().filter((v) => v.localService && /^es/i.test(v.lang));
  const voz = voces.find((v) => /co|419|mx|us/i.test(v.lang)) || voces[0];
  if (!voz) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.voice = voz; u.lang = voz.lang; u.rate = 0.95;
  speechSynthesis.speak(u);
}
export const hayVoz = () => 'speechSynthesis' in window && speechSynthesis.getVoices().some((v) => v.localService && /^es/i.test(v.lang));

// Animación con Web Animations API; respeta «reducir movimiento».
export function animar(el, frames, opts) {
  if (!el) return Promise.resolve();
  if (reducido()) {
    const ultimo = Array.isArray(frames) ? frames[frames.length - 1] : null;
    if (ultimo && opts && opts.fill && opts.fill !== 'none') Object.assign(el.style, ultimo);
    return Promise.resolve();
  }
  return el.animate(frames, opts).finished.catch(() => {});
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, reducido() ? Math.min(ms, 60) : ms));

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
