// Celebraciones cortas: chispas para cromos brillantes y lluvia de hojas de frailejón al completar.
import { reducido } from './util.js';

export function chispas(el) {
  if (reducido()) return;
  const b = el.getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span');
    s.className = 'chispa';
    const x = b.left + Math.random() * b.width, y = b.top + Math.random() * b.height;
    s.style.left = `${x}px`; s.style.top = `${y}px`;
    document.body.appendChild(s);
    const dx = (Math.random() - 0.5) * 80, dy = (Math.random() - 0.5) * 80;
    s.animate([{ transform: 'translate(-50%,-50%) scale(0) rotate(0deg)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(90deg)`, opacity: 1, offset: 0.5 }, { transform: `translate(calc(-50% + ${dx * 1.4}px), calc(-50% + ${dy * 1.4}px)) scale(0) rotate(180deg)`, opacity: 0 }],
      { duration: 900 + Math.random() * 500, delay: Math.random() * 300, easing: 'ease-out' }).finished.then(() => s.remove());
  }
}

// Hojas de frailejón (verde y amarillo) que caen. Dura ~3 s y se apaga sola.
export function lluvia(ms = 3200) {
  if (reducido()) return;
  const cv = document.getElementById('confeti');
  const ctx = cv.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cv.style.display = 'block';
  const colores = ['#2f6b4f', '#f4c431', '#8fb38a', '#f4c431', '#d8492b'];
  const hojas = Array.from({ length: 70 }, () => ({
    x: Math.random() * cv.width, y: -Math.random() * cv.height * 0.6, r: (5 + Math.random() * 7) * dpr,
    vy: (1.6 + Math.random() * 2.4) * dpr, vx: (Math.random() - 0.5) * 1.2 * dpr, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.15,
    c: colores[(Math.random() * colores.length) | 0],
  }));
  const t0 = performance.now();
  const paso = (t) => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const h of hojas) {
      h.y += h.vy; h.x += h.vx + Math.sin((t + h.r * 50) / 400) * 0.6 * dpr; h.a += h.va;
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.a); ctx.fillStyle = h.c;
      ctx.beginPath(); ctx.ellipse(0, 0, h.r * 0.45, h.r, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (t - t0 < ms) requestAnimationFrame(paso);
    else { ctx.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none'; }
  };
  requestAnimationFrame(paso);
}
