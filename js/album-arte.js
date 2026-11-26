// Ilustraciones originales del equipo (copiado de espeletia-ai/js/art.js), estilo risografía a dos tintas.
// Cada dibujo: { g: tinta verde, y: tinta amarilla, p: papel (reservas blancas) } en un lienzo de 100×100.
// Clase "l" = línea (trazo) en vez de relleno.

const A = {
  brisas: {
    y: '<circle cx="74" cy="26" r="11"/><path d="M0 84 Q30 76 60 82 T100 80 V100 H0Z"/>',
    g: '<path d="M4 84 L38 34 L52 52 L64 40 L96 84Z"/><path d="M20 84 V70 L29 62 L38 70 V84Z"/>',
    p: '<path d="M33 40 L38 34 L43 41 L38 39Z"/><rect x="26" y="74" width="6" height="10"/>',
  },
  e2: {
    y: '<circle cx="38" cy="74" r="12"/><path class="l" d="M68 22 V58 M52 40 H84 M57 29 L79 51 M79 29 L57 51"/>',
    g: '<rect x="32" y="14" width="12" height="54" rx="6"/><circle cx="38" cy="74" r="14"/>',
    p: '<rect x="36" y="22" width="4" height="40" rx="2"/>',
  },
  e3: {
    y: '<circle cx="22" cy="56" r="4"/><circle cx="48" cy="62" r="4"/><circle cx="76" cy="54" r="4"/><circle cx="62" cy="76" r="5"/><circle cx="30" cy="80" r="5"/>',
    g: '<path d="M0 60 Q25 48 50 58 T100 52 V100 H0Z"/><path class="l" d="M22 56 V48 M48 62 V52 M76 54 V46 M62 76 V64 M30 80 V68"/>',
  },
  tumbas: {
    y: '<circle cx="50" cy="20" r="7"/><circle cx="60" cy="12" r="5"/><circle cx="42" cy="10" r="4"/><path d="M0 88 H100 V100 H0Z"/>',
    g: '<path d="M8 90 L38 36 H62 L92 90Z"/>',
    p: '<path d="M38 36 H62 L58 44 Q50 40 42 44Z"/>',
  },
  mirada: {
    y: '<path d="M18 62 A32 32 0 0 1 82 62Z"/>',
    g: '<path d="M0 66 Q30 54 60 64 T100 60 V100 H0Z"/><path class="l" d="M10 40 Q50 8 90 40 Q50 72 10 40Z"/><circle cx="50" cy="40" r="9"/>',
  },
  grupo: {
    y: '<circle cx="50" cy="40" r="30"/>',
    g: '<circle cx="28" cy="48" r="8"/><path d="M14 90 Q14 62 28 62 Q42 62 42 90Z"/><circle cx="50" cy="42" r="9"/><path d="M34 90 Q34 56 50 56 Q66 56 66 90Z"/><circle cx="72" cy="48" r="8"/><path d="M58 90 Q58 62 72 62 Q86 62 86 90Z"/>',
  },
  frailejon: {
    y: '<circle cx="50" cy="10" r="5"/><circle cx="64" cy="14" r="4"/><circle cx="36" cy="14" r="4"/><path class="l" d="M50 15 V30 M62 18 L56 30 M38 18 L44 30"/>',
    g: '<g transform="translate(50 44)">' + Array.from({ length: 14 }, (_, i) => `<ellipse rx="5" ry="17" cy="-14" transform="rotate(${i * 360 / 14})"/>`).join('') + '</g><rect x="44" y="56" width="12" height="34" rx="3"/>',
  },
  hojas: {
    y: '<g transform="translate(50 24)">' + Array.from({ length: 10 }, (_, i) => `<ellipse rx="4" ry="12" cy="-9" transform="rotate(${i * 36})"/>`).join('') + '</g>',
    g: '<path d="M36 34 H64 L62 92 H38Z"/>',
    p: '<path class="l" d="M38 42 L62 46 M38 52 L62 56 M38 62 L62 66 M38 72 L62 76 M38 82 L62 86"/>',
  },
  pajonal: {
    y: '<path d="M0 82 Q50 70 100 82 V100 H0Z"/>',
    g: '<path class="l" d="M20 84 Q16 60 8 46 M24 84 Q24 58 22 40 M28 84 Q32 60 40 48 M58 84 Q54 58 46 44 M62 84 Q62 54 62 34 M66 84 Q70 58 78 46 M70 84 Q78 66 92 58"/>',
  },
  sietecueros: {
    y: '<path d="M44 90 Q40 70 48 56 L54 56 Q60 72 56 90Z"/>',
    g: '<path d="M46 90 Q42 70 50 56 Q42 48 30 50 Q36 44 48 46 Q46 36 36 30 Q50 32 52 44 Q58 34 70 32 Q60 40 56 50 Q64 52 72 48 Q66 58 54 58 Q60 74 56 90Z"/><circle cx="30" cy="28" r="12"/><circle cx="54" cy="22" r="14"/><circle cx="74" cy="30" r="11"/>',
    p: '<path class="l" d="M48 64 L54 62 M47 74 L55 72 M48 84 L55 82"/>',
  },
  musgo: {
    y: '<circle cx="30" cy="54" r="3"/><circle cx="62" cy="48" r="3"/><circle cx="78" cy="64" r="2.5"/><circle cx="44" cy="44" r="2.5"/><circle cx="20" cy="70" r="2"/>',
    g: '<path d="M6 86 Q8 62 28 60 Q34 42 54 46 Q70 38 80 56 Q96 60 94 86Z"/>',
    p: '<circle cx="36" cy="70" r="2"/><circle cx="58" cy="64" r="2"/><circle cx="72" cy="76" r="2"/><circle cx="24" cy="78" r="1.6"/><circle cx="48" cy="80" r="1.6"/>',
  },
  laguna: {
    y: '<circle cx="66" cy="26" r="10"/><path class="l" d="M30 70 H54 M40 78 H68 M24 62 H40"/>',
    g: '<path d="M0 52 Q20 40 40 48 T80 44 T100 48 V56 H0Z"/><ellipse cx="50" cy="72" rx="44" ry="16"/>',
    p: '<path class="l" d="M30 70 H54 M40 78 H68 M24 62 H40"/>',
  },
  roca: {
    y: '<circle cx="18" cy="40" r="2"/><circle cx="34" cy="30" r="2"/><circle cx="70" cy="34" r="2"/><circle cx="86" cy="46" r="2"/><circle cx="54" cy="24" r="2"/><path d="M0 88 H100 V100 H0Z"/>',
    g: '<path d="M10 88 L18 60 L40 52 L52 66 L50 88Z"/><path d="M48 88 L56 56 L74 48 L90 62 L92 88Z"/>',
    p: '<path class="l" d="M24 64 L36 70 M62 60 L70 66"/>',
  },
  nevado: {
    y: '<circle cx="80" cy="20" r="8"/>',
    g: '<path d="M2 90 L44 26 L58 44 L66 36 L98 90Z"/>',
    p: '<path d="M44 26 L54 41 L48 38 L42 44 L36 38Z M66 36 L72 46 L66 44 L62 48 L60 42Z"/>',
  },
  condor: {
    y: '<circle cx="50" cy="66" r="26"/>',
    g: '<path d="M50 40 C38 26 22 22 4 30 C18 32 26 36 32 44 C22 44 14 48 8 54 C26 50 40 52 48 54Z M50 40 C62 26 78 22 96 30 C82 32 74 36 68 44 C78 44 86 48 92 54 C74 50 60 52 52 54Z"/><circle cx="50" cy="34" r="6"/>',
    p: '<path d="M43 44 Q50 48 57 44 Q54 40 50 40 Q46 40 43 44Z"/>',
  },
  oso: {
    y: '<circle cx="40" cy="38" r="7"/><circle cx="56" cy="38" r="7"/><path d="M0 88 H100 V100 H0Z"/>',
    g: '<path d="M20 88 Q16 60 30 50 Q24 40 30 30 Q36 20 48 22 Q62 20 66 32 Q70 42 64 50 Q84 56 82 88Z"/><circle cx="32" cy="24" r="6"/><circle cx="62" cy="24" r="6"/>',
    p: '<circle cx="40" cy="38" r="2.4"/><circle cx="56" cy="38" r="2.4"/>',
  },
  danta: {
    y: '<path d="M0 86 H100 V100 H0Z"/><circle cx="76" cy="22" r="8"/>',
    g: '<path d="M14 54 Q18 38 40 38 H66 Q82 38 86 50 Q92 50 94 58 Q88 60 84 58 L80 66 V86 H72 V68 H36 V86 H28 V66 Q14 64 14 54Z"/>',
    p: '<circle cx="80" cy="48" r="1.8"/>',
  },
  periquito: {
    y: '<path d="M36 34 Q44 26 52 30 Q48 38 40 40Z"/><path class="l" d="M10 80 H90"/>',
    g: '<path d="M38 36 Q50 22 62 32 Q70 40 66 56 Q62 72 50 80 L56 94 L46 84 Q34 74 36 56 Q32 50 30 44 Q34 40 38 36Z"/>',
    p: '<circle cx="50" cy="34" r="2"/>',
  },
  pato: {
    y: '<path d="M0 66 Q25 58 50 66 T100 66 V100 H0Z"/>',
    g: '<path d="M20 62 Q22 46 44 46 Q50 36 60 36 Q70 36 72 46 L82 48 L72 52 Q70 60 62 62Z"/>',
    p: '<circle cx="63" cy="43" r="1.8"/>',
  },
  aguila: {
    y: '<path d="M44 46 Q50 40 56 46 L54 62 H46Z"/>',
    g: '<path d="M50 44 L8 34 Q24 48 40 50 L46 66 L42 76 H58 L54 66 L60 50 Q76 48 92 34Z"/><circle cx="50" cy="40" r="5"/>',
  },
  agua: {
    y: '<path d="M50 8 Q30 36 30 50 A20 20 0 0 0 70 50 Q70 36 50 8Z"/>',
    g: '<path class="l" d="M50 72 Q40 84 22 92 M50 72 Q50 84 48 96 M50 72 Q62 84 80 90 M50 72 Q70 76 94 74"/>',
    p: '<path d="M42 44 Q44 36 48 32 Q44 42 46 50Z"/>',
  },
  volcanes: {
    y: '<circle cx="50" cy="16" r="8"/>',
    g: '<path d="M0 88 L22 48 L44 88Z"/><path d="M28 88 L52 34 L76 88Z"/><path d="M58 88 L80 52 L100 88Z"/>',
    p: '<path d="M52 34 L58 47 L52 44 L46 47Z M22 48 L26 56 L22 54 L18 56Z M80 52 L84 60 L80 58 L76 60Z"/>',
  },
  huella: {
    y: '<path class="l" d="M10 94 Q40 70 30 50 T60 10"/>',
    g: '<ellipse cx="34" cy="74" rx="7" ry="11" transform="rotate(-20 34 74)"/><ellipse cx="54" cy="52" rx="7" ry="11" transform="rotate(-10 54 52)"/><ellipse cx="44" cy="28" rx="7" ry="11" transform="rotate(10 44 28)"/>',
  },
  sombrilla: {
    y: '<path d="M14 40 Q50 0 86 40Z"/><path class="l" d="M50 40 V60"/>',
    g: '<circle cx="34" cy="74" r="6"/><circle cx="26" cy="64" r="2.6"/><circle cx="32" cy="60" r="2.6"/><circle cx="39" cy="61" r="2.6"/><circle cx="43" cy="67" r="2.6"/><circle cx="64" cy="84" r="6"/><circle cx="56" cy="74" r="2.6"/><circle cx="62" cy="70" r="2.6"/><circle cx="69" cy="71" r="2.6"/><circle cx="73" cy="77" r="2.6"/>',
  },
};

// Corrimiento de registro: cada impresión sale un poquito distinta (pero estable para cada cromo).
function corrimiento(id) {
  let s = 0; for (const ch of id) s = (s * 31 + ch.charCodeAt(0)) % 997;
  return [((s % 7) - 3) * 0.45, (((s >> 3) % 5) - 2) * 0.45];
}

export function ilustracion(id, { silueta = false } = {}) {
  const a = A[id];
  if (!a) return '';
  const [dx, dy] = corrimiento(id);
  if (silueta) {
    return `<svg class="ilus silueta" viewBox="0 0 100 100" aria-hidden="true"><g class="ink-g">${a.g}</g></svg>`;
  }
  return `<svg class="ilus" viewBox="0 0 100 100" aria-hidden="true">
    <g class="ink-y" transform="translate(${dx} ${dy})">${a.y || ''}</g>
    <g class="ink-g">${a.g}</g>
    ${a.p ? `<g class="ink-p">${a.p}</g>` : ''}
  </svg>`;
}

// ---------- Personajes ----------
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
  return `<svg class="pj-svg" viewBox="0 0 100 110" width="${size}" height="${size * 1.1}" aria-hidden="true">
    <rect x="41" y="62" width="18" height="40" rx="5" fill="#a4835f"/>
    <path d="M41 72 h18 M41 82 h18 M41 92 h18" stroke="#86684a" stroke-width="2"/>
    ${hojas}
    <circle cx="50" cy="12" r="5" fill="#f4c431"/><circle cx="64" cy="16" r="4" fill="#f4c431"/><circle cx="36" cy="16" r="4" fill="#f4c431"/>
    <circle cx="50" cy="44" r="18" fill="#e7efe0"/>
    ${cara(50, 45, 0.95)}
  </svg>`;
}

export function condor(size = 96) {
  return `<svg class="pj-svg" viewBox="0 0 140 84" width="${size * 1.3}" height="${size * 0.78}" aria-hidden="true">
    <path d="M70 42 C50 24 26 20 4 32 C22 32 34 38 44 46 C30 44 18 48 10 54 C30 52 50 54 66 54 Z" fill="#26323d"/>
    <path d="M70 42 C90 24 114 20 136 32 C118 32 106 38 96 46 C110 44 122 48 130 54 C110 52 90 54 74 54 Z" fill="#26323d"/>
    <path d="M30 46 C40 42 52 44 62 48 M110 46 C100 42 88 44 78 48" stroke="#e8ede9" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="70" cy="48" rx="12" ry="10" fill="#26323d"/>
    <path d="M58 42 Q70 48 82 42 Q78 36 70 36 Q62 36 58 42Z" fill="#f3f4ef"/>
    <circle cx="70" cy="28" r="9.5" fill="#d9907b"/>
    <path d="M70 32 l5 4 -5 1z" fill="#f4c431"/>
    <circle cx="66.5" cy="26" r="1.9" fill="#1f2a33"/><circle cx="73.5" cy="26" r="1.9" fill="#1f2a33"/>
  </svg>`;
}

export function magma(size = 96) {
  return `<svg class="pj-svg" viewBox="0 0 100 90" width="${size}" height="${size * 0.9}" aria-hidden="true">
    <path d="M14 80 C6 60 14 34 34 24 C46 18 62 18 72 26 C90 38 96 62 86 80 Z" fill="#3a3a44"/>
    <path d="M34 24 C40 12 60 10 70 24 C62 20 54 30 48 22 C44 28 38 22 34 24Z" fill="#ec6a3a"/>
    <path d="M24 48 l8 6 M74 44 l-6 8 M60 68 l8 4" stroke="#55555f" stroke-width="3" stroke-linecap="round"/>
    <path d="M38 40 l4 10 M60 38 l-4 10" stroke="#f4c431" stroke-width="2.4" stroke-linecap="round"/>
    ${cara(50, 60, 1, '#f3ece1')}
  </svg>`;
}

export const personajes = { fray, condor, magma };
