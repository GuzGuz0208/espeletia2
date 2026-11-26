// Ilustraciones de los cromos: risografía a dos tintas (verde frailejón + amarillo flor), dibujadas en código.
// Vienen del Álbum del Páramo (legado/album/js/art.js); loricaria y Kumanday son nuevas. Lienzo de 100×100.
// Cada dibujo: y = tinta amarilla, g = tinta verde, p = reservas de papel. Clase «l» = trazo en vez de relleno.

const A = {
  'brisas-agua': {
    y: '<circle cx="74" cy="26" r="11"/><path d="M0 84 Q30 76 60 82 T100 80 V100 H0Z"/>',
    g: '<path d="M4 84 L38 34 L52 52 L64 40 L96 84Z"/><path d="M20 84 V70 L29 62 L38 70 V84Z"/>',
    p: '<path d="M33 40 L38 34 L43 41 L38 39Z"/><rect x="26" y="74" width="6" height="10"/>',
  },
  'aguacerales-frailejon': {
    y: '<circle cx="50" cy="10" r="5"/><circle cx="64" cy="14" r="4"/><circle cx="36" cy="14" r="4"/><path class="l" d="M50 15 V30 M62 18 L56 30 M38 18 L44 30"/>',
    g: '<g transform="translate(50 44)">' + Array.from({ length: 14 }, (_, i) => `<ellipse rx="5" ry="17" cy="-14" transform="rotate(${i * 360 / 14})"/>`).join('') + '</g><rect x="44" y="56" width="12" height="34" rx="3"/>',
  },
  'aguacerales-condensacion': {
    y: '<path class="l" d="M6 30 H44 M14 40 H60 M52 22 H94"/>',
    g: '<path d="M50 34 C50 34 30 58 30 72 A20 20 0 0 0 70 72 C70 58 50 34 50 34Z"/><path d="M80 52 C80 52 70 64 70 71 A10 10 0 0 0 90 71 C90 64 80 52 80 52Z"/><path d="M22 58 C22 58 14 68 14 74 A8 8 0 0 0 30 74 C30 68 22 58 22 58Z"/>',
    p: '<path d="M40 66 Q42 58 48 54 Q44 62 44 70Z"/>',
  },
  'arenales-dunas': {
    y: '<circle cx="22" cy="56" r="4"/><circle cx="48" cy="62" r="4"/><circle cx="76" cy="54" r="4"/><circle cx="62" cy="76" r="5"/><circle cx="30" cy="80" r="5"/>',
    g: '<path d="M0 60 Q25 48 50 58 T100 52 V100 H0Z"/><path class="l" d="M22 56 V48 M48 62 V52 M76 54 V46 M62 76 V64 M30 80 V68"/>',
  },
  'arenales-esqui': {
    y: '<circle cx="24" cy="22" r="10"/>',
    g: '<path d="M0 96 L60 30 L100 70 V100 H0Z"/><circle cx="64" cy="52" r="4"/><path class="l" d="M64 56 L58 68 M58 68 L66 76 M60 62 L70 60 M50 80 L74 70"/>',
    p: '<path d="M60 30 L72 42 L66 40 L60 46 L54 38Z"/><path class="l" d="M30 92 Q40 84 36 76 T46 62"/>',
  },
  'lunares-gelifraccion': {
    y: '<circle cx="76" cy="22" r="12"/><path d="M0 86 Q40 78 100 84 V100 H0Z"/>',
    g: '<path d="M6 86 L22 58 L40 64 L52 46 L70 60 L94 86Z"/><path class="l" d="M52 46 L48 60 L54 70 M40 64 L36 76 M70 60 L74 74"/>',
    p: '<circle cx="80" cy="18" r="9"/><path class="l" d="M22 58 L26 70 M48 60 L42 66"/>',
  },
  'lunares-loricaria': {
    y: '<circle cx="76" cy="24" r="10"/><path d="M0 88 Q50 80 100 88 V100 H0Z"/>',
    g: '<path class="l" d="M50 90 V58 M50 70 L34 56 M34 56 V42 M34 56 L24 48 M50 64 L66 50 M66 50 V36 M66 50 L78 44 M50 58 L44 40 M50 58 L56 40"/><circle cx="34" cy="40" r="4"/><circle cx="24" cy="46" r="3.5"/><circle cx="66" cy="34" r="4"/><circle cx="78" cy="42" r="3.5"/><circle cx="44" cy="38" r="3.5"/><circle cx="56" cy="38" r="3.5"/>',
  },
  'tumbas-nombre': {
    y: '<circle cx="50" cy="20" r="7"/><circle cx="60" cy="12" r="5"/><circle cx="42" cy="10" r="4"/><path d="M0 88 H100 V100 H0Z"/>',
    g: '<path d="M8 90 L38 36 H62 L92 90Z"/>',
    p: '<path d="M38 36 H62 L58 44 Q50 40 42 44Z"/>',
  },
  'tumbas-kumanday': {
    y: '<circle cx="62" cy="14" r="6"/><circle cx="72" cy="8" r="4.5"/><circle cx="54" cy="8" r="3.5"/>',
    g: '<path d="M2 92 L38 34 H62 L98 92Z"/>',
    p: '<path d="M38 34 H62 L70 47 Q60 42 54 48 Q48 42 42 48 Q36 43 30 47Z"/><path class="l" d="M20 80 Q50 70 80 80"/>',
  },
  'condor': {
    y: '<circle cx="50" cy="66" r="26"/>',
    g: '<path d="M50 40 C38 26 22 22 4 30 C18 32 26 36 32 44 C22 44 14 48 8 54 C26 50 40 52 48 54Z M50 40 C62 26 78 22 96 30 C82 32 74 36 68 44 C78 44 86 48 92 54 C74 50 60 52 52 54Z"/><circle cx="50" cy="34" r="6"/>',
    p: '<path d="M43 44 Q50 48 57 44 Q54 40 50 40 Q46 40 43 44Z"/>',
  },
};

// Corrimiento de registro: cada impresión sale un poco distinta, pero estable para cada cromo.
function corrimiento(id) {
  let s = 0; for (const ch of id) s = (s * 31 + ch.charCodeAt(0)) % 997;
  return [((s % 7) - 3) * 0.45, (((s >> 3) % 5) - 2) * 0.45];
}

export function ilustracion(id) {
  const a = A[id] || A['brisas-agua'];
  const [dx, dy] = corrimiento(id);
  return `<svg class="ilus" viewBox="0 0 100 100" aria-hidden="true">
    <g class="ink-y" transform="translate(${dx} ${dy})">${a.y || ''}</g>
    <g class="ink-g">${a.g}</g>
    ${a.p ? `<g class="ink-p">${a.p}</g>` : ''}
  </svg>`;
}

/** Silueta del cromo bloqueado: solo la forma (tinta verde) en el color del texto. */
export function silueta(id) {
  const a = A[id] || A['brisas-agua'];
  return `<svg class="silueta" viewBox="0 0 100 100" aria-hidden="true"><g fill="currentColor" stroke="currentColor">${a.g}</g></svg>`;
}
