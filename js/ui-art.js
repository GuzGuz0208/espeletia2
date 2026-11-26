// Fray, el frailejón (dibujo del Álbum del Páramo, js/art.js del proyecto anterior) e iconos de la interfaz.

function cara(cx, cy, s = 1, tinta = '#1f2a33') {
  return `<g transform="translate(${cx} ${cy}) scale(${s})">
    <circle cx="-7" cy="-2" r="2.6" fill="${tinta}"/><circle cx="7" cy="-2" r="2.6" fill="${tinta}"/>
    <path d="M-6 5 Q0 10 6 5" stroke="${tinta}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <circle cx="-12" cy="4" r="2.6" fill="#ef8f7a" opacity=".75"/><circle cx="12" cy="4" r="2.6" fill="#ef8f7a" opacity=".75"/>
  </g>`;
}

export function fray(size = 96) {
  let hojas = '';
  for (let i = 0; i < 16; i++) hojas += `<ellipse cx="50" cy="21" rx="7" ry="21" transform="rotate(${(i / 16) * 360} 50 44)" fill="${i % 2 ? '#8fb38a' : '#6f9a6c'}"/>`;
  return `<svg class="fray-svg" viewBox="0 0 100 110" width="${size}" height="${size * 1.1}" aria-hidden="true">
    <rect x="41" y="62" width="18" height="40" rx="5" fill="#a4835f"/>
    <path d="M41 72 h18 M41 82 h18 M41 92 h18" stroke="#86684a" stroke-width="2"/>
    ${hojas}
    <circle cx="50" cy="12" r="5" fill="#f4c431"/><circle cx="64" cy="16" r="4" fill="#f4c431"/><circle cx="36" cy="16" r="4" fill="#f4c431"/>
    <circle cx="50" cy="44" r="18" fill="#e7efe0"/>
    ${cara(50, 45, 0.95)}
  </svg>`;
}

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`;
export const iconos = {
  qr: svg('<path d="M3 3h8v8H3zm2 2v4h4V5zm8-2h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zm8-2h3v3h-3zm5 0h3v3h-3zm-5 5h3v3h-3zm5 0h3v3h-3z"/>'),
  volver: svg('<path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z"/>'),
  ajustes: svg('<path d="M3 17h6v2H3zm0-12h10v2H3zm8 14v-2h10v-2H11v-2H9v6zM7 9v2H3v2h4v2h2V9zm14 4v-2H11v2zm-6-4h2V7h4V5h-4V3h-2z"/>'),
  escuchar: svg('<path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>'),
  alerta: svg('<path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/>'),
  libro: svg('<path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM6 4h5v8l-2.5-1.5L6 12z"/>'),
  enviar: svg('<path d="M2 21 23 12 2 3v7l15 2-15 2z"/>'),
};
