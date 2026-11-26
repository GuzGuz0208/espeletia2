// PDF del álbum con certificado «Guardián del páramo» (de espeletia-ai/js/exportar.js, rama r2/instalar), armado en el
// teléfono, sin red ni librerías. Por la vigencia de 24 h (contrato §7) el PDF NO lleva textos de los guiones: solo el nombre
// del visitante, los cromos (número, título e ilustración o foto propia), el recorrido (estaciones y hora), la fecha y el
// certificado. Cada página se dibuja en un lienzo y va al PDF como JPEG, con una capa de texto invisible.
import { E, cromo as getCromo, fotoBlob, capitulos, cromosDe, abierto, total, pegados, estaciones, nombreEstacion } from './album-estado.js';
import { personajes, ilustracion } from './album-arte.js';
import { t } from './album-textos.js';
import { fecha, num, arte } from './album-cromo.js';

const C = { papel: '#e6ece8', papel2: '#f1f4f1', verde: '#2f6b4f', amarillo: '#f4c431', noche: '#1d2b38', sello: '#d8492b', gris: '#5d6f68' };
const ESTILO = `<style>.ink-y{fill:${C.amarillo}}.ink-g{fill:${C.verde};mix-blend-mode:multiply}.ink-p{fill:${C.papel2}}.l{fill:none!important;stroke-width:3;stroke-linecap:round}.ink-y .l{stroke:${C.amarillo}}.ink-g .l{stroke:${C.verde}}.ink-p .l{stroke:${C.papel2};stroke-width:2.2}</style>`;

function svgImg(svg) {
  return new Promise((ok, mal) => {
    const limpio = svg.replace(/^(<svg[^>]*?) width="[^"]*"/, '$1').replace(/^(<svg[^>]*?) height="[^"]*"/, '$1');
    const s = limpio.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" `).replace('>', `>${ESTILO}`);
    const img = new Image(); img.onload = () => ok(img); img.onerror = mal;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  });
}
function blobImg(b) {
  return new Promise((ok, mal) => { const u = URL.createObjectURL(b); const i = new Image(); i.onload = () => { ok(i); URL.revokeObjectURL(u); }; i.onerror = mal; i.src = u; });
}
async function fuentes() {
  await Promise.all(['800 90px Bricolage', '700 40px Bricolage', '400 30px Atkinson', '700 30px Atkinson'].map((f) => document.fonts.load(f.replace('Bricolage', '"Bricolage Grotesque"').replace('Atkinson', '"Atkinson Hyperlegible"')))).catch(() => {});
}
function lineas(ctx, txt, x, y, ancho, alto, max = 5) {
  const pal = txt.split(' '); let l = '', n = 0;
  for (const p of pal) {
    const prueba = l ? `${l} ${p}` : p;
    if (ctx.measureText(prueba).width > ancho && l) { ctx.fillText(l, x, y + n * alto); n++; l = p; if (n >= max) return y + n * alto; }
    else l = prueba;
  }
  if (l) { ctx.fillText(l, x, y + n * alto); n++; }
  return y + n * alto;
}
function cubrir(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
}
function troquel(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  for (let i = x + r * 2; i < x + w - r; i += r * 4.4) { ctx.beginPath(); ctx.arc(i, y, r, 0, 7); ctx.arc(i, y + h, r, 0, 7); ctx.fill(); }
  for (let j = y + r * 2; j < y + h - r; j += r * 4.4) { ctx.beginPath(); ctx.arc(x, j, r, 0, 7); ctx.arc(x + w, j, r, 0, 7); ctx.fill(); }
}

// Dibuja el frente de un cromo en (x, y) con ancho w (alto = w * 4/3).

// Frente de un cromo en (x, y) con ancho w (alto = w * 4/3). Sin el dato del guion.
async function frente(ctx, id, x, y, w) {
  const c = getCromo(id), r = E.album[id], hgt = w * 4 / 3, u = w / 100;
  ctx.save();
  ctx.fillStyle = C.papel2; ctx.beginPath(); ctx.roundRect(x, y, w, hgt, 3 * u); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.roundRect(x + 4 * u, y + 4 * u, w - 8 * u, hgt - 30 * u, 2 * u); ctx.clip();
  const foto = r?.foto ? await fotoBlob(id) : null;
  if (foto) cubrir(ctx, await blobImg(foto), x + 4 * u, y + 4 * u, w - 8 * u, hgt - 30 * u);
  else { ctx.fillStyle = '#dfe7e2'; ctx.fillRect(x, y, w, hgt); ctx.drawImage(await svgImg(arte(c)), x + 10 * u, y + 10 * u, w - 20 * u, w - 20 * u); }
  ctx.restore();
  ctx.fillStyle = C.amarillo; ctx.fillRect(x, y + hgt - 26 * u, w, 26 * u);
  ctx.fillStyle = C.verde; ctx.font = `800 ${17 * u}px "Bricolage Grotesque"`; ctx.fillText(num(c.n), x + 5 * u, y + hgt - 8 * u);
  ctx.fillStyle = C.noche; ctx.font = `700 ${8.4 * u}px "Bricolage Grotesque"`;
  lineas(ctx, c.nombre, x + 27 * u, y + hgt - 15 * u, w - 32 * u, 8.6 * u, 2);
  if (r) {
    ctx.save(); ctx.translate(x + w - 19 * u, y + 19 * u); ctx.rotate(-0.2); ctx.globalAlpha = 0.9;
    ctx.strokeStyle = C.sello; ctx.fillStyle = C.sello; ctx.lineWidth = 1.6 * u;
    ctx.beginPath(); ctx.arc(0, 0, 13 * u, 0, 7); ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = `700 ${3.6 * u}px "Atkinson Hyperlegible"`; ctx.fillText(fecha(r.fecha), 0, 1.2 * u); ctx.restore();
  }
  ctx.restore();
}

export function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const PW = 1240, PH = 1754; // A4 a 150 ppp
const MARGEN = 90;

// Pone la fuente más grande (hasta «max») con la que el texto cabe en «ancho»
function ajustar(ctx, txt, ancho, max, plantilla) {
  let px = max;
  do { ctx.font = plantilla.replace('{px}', px); px -= 2; } while (ctx.measureText(txt).width > ancho && px > 12);
}
// Corta por caracteres un texto sin espacios (una dirección web) para que no se salga

function pagina() {
  const cv = document.createElement('canvas'); cv.width = PW; cv.height = PH;
  const ctx = cv.getContext('2d');
  ctx.fontStretch = 'condensed';
  ctx.fillStyle = C.papel; ctx.fillRect(0, 0, PW, PH);
  return { cv, ctx, textos: [] };
}
const fechaLarga = (ms = Date.now()) => new Date(ms).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const horaTxt = (ms) => new Date(ms).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

function encabezado(p, titulo, sub) {
  const { ctx } = p;
  ctx.fillStyle = C.verde; ctx.font = '800 64px "Bricolage Grotesque"'; ctx.fillText(titulo, MARGEN, 150);
  if (sub) { ctx.fillStyle = C.gris; ctx.font = '400 30px "Atkinson Hyperlegible"'; lineas(ctx, sub, MARGEN, 200, PW - 2 * MARGEN, 38, 3); }
  p.textos.push(titulo); if (sub) p.textos.push(sub);
}
function pie(p, n) {
  const { ctx } = p;
  ctx.fillStyle = C.gris; ctx.font = '400 22px "Atkinson Hyperlegible"';
  ctx.fillText(`${t('titulo')} · ${t('parque')}`, MARGEN, PH - 50);
  ctx.textAlign = 'right'; ctx.fillText(String(n), PW - MARGEN, PH - 50); ctx.textAlign = 'left';
}

// ---------- Portada: ilustración original de Manizales y del Nevado del Ruiz ----------
async function portada() {
  const p = pagina(), { ctx } = p, W = PW, Hs = 1060;
  // Cielo y sol
  ctx.fillStyle = C.papel2; ctx.fillRect(0, 0, W, Hs);
  ctx.fillStyle = C.amarillo; ctx.beginPath(); ctx.arc(W * 0.79, 230, 110, 0, 7); ctx.fill();
  // Cordillera de fondo y el Nevado del Ruiz (volcán ancho con su casquete de nieve)
  ctx.globalAlpha = 0.45; ctx.fillStyle = C.verde;
  ctx.beginPath(); ctx.moveTo(0, 700); ctx.lineTo(180, 560); ctx.lineTo(330, 640); ctx.lineTo(470, 520); ctx.lineTo(640, 650); ctx.lineTo(W, 600); ctx.lineTo(W, Hs); ctx.lineTo(0, Hs); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.verde; ctx.beginPath(); ctx.moveTo(330, 760); ctx.lineTo(610, 380); ctx.lineTo(760, 372); ctx.lineTo(1060, 760); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(560, 448); ctx.lineTo(610, 380); ctx.lineTo(760, 372); ctx.lineTo(812, 440);
  for (let x = 812, k = 0; x > 560; x -= 28, k++) ctx.lineTo(x - 14, 440 + (k % 2 ? 26 : 6));
  ctx.closePath(); ctx.fill();
  // Manizales sobre su filo de montaña: casas, edificios y la torre de la catedral
  ctx.fillStyle = C.noche;
  ctx.beginPath(); ctx.moveTo(0, 860); ctx.quadraticCurveTo(260, 760, 560, 850); ctx.quadraticCurveTo(760, 900, W, 880); ctx.lineTo(W, Hs); ctx.lineTo(0, Hs); ctx.fill();
  const casas = [[40, 40, 46], [92, 30, 64], [130, 52, 38], [190, 36, 90], [232, 44, 56], [290, 28, 72], [372, 40, 50], [420, 34, 66], [470, 46, 44]];
  for (const [x, w, h] of casas) { const base = 838 - Math.sin(x / 180) * 30; ctx.fillRect(x, base - h, w, h + 40); }
  // Catedral: cuerpo, torre central y aguja
  ctx.fillRect(318, 700, 58, 140); ctx.beginPath(); ctx.moveTo(318, 700); ctx.lineTo(347, 610); ctx.lineTo(376, 700); ctx.fill();
  ctx.fillRect(342, 560, 10, 60);
  ctx.fillStyle = C.amarillo; // ventanas encendidas
  for (const [x, w, h] of casas) { const base = 838 - Math.sin(x / 180) * 30; for (let k = 10; k < h - 8; k += 22) ctx.fillRect(x + 8, base - h + k, 8, 9); }
  ctx.fillRect(342, 735, 10, 22);
  // Páramo en primer plano, con frailejones
  ctx.fillStyle = '#285c44'; ctx.beginPath(); ctx.moveTo(0, 990); ctx.quadraticCurveTo(W / 2, 900, W, 980); ctx.lineTo(W, Hs); ctx.lineTo(0, Hs); ctx.fill();
  const fr = await svgImg(ilustracion('frailejon'));
  ctx.drawImage(fr, 840, 820, 240, 240); ctx.drawImage(fr, 1010, 880, 170, 170); ctx.drawImage(fr, 690, 900, 150, 150);
  ctx.fillStyle = C.papel; ctx.font = '700 24px "Atkinson Hyperlegible"';
  ctx.fillText('Manizales', 60, 920); ctx.fillStyle = C.noche; ctx.fillText('Nevado del Ruiz', 610, 350);
  ctx.drawImage(await svgImg(personajes.fray(100)), 70, 960, 210, 230);
  // Título y dueño
  ctx.fillStyle = C.verde; ajustar(ctx, t('titulo'), PW - 2 * MARGEN, 150, '800 {px}px "Bricolage Grotesque"'); ctx.fillText(t('titulo'), MARGEN, 1290);
  ctx.fillStyle = C.noche; ctx.font = '700 40px "Atkinson Hyperlegible"'; ctx.fillText(t('parque'), MARGEN, 1360);
  ctx.fillStyle = C.verde; ctx.fillRect(MARGEN, 1420, PW - 2 * MARGEN, 6);
  ctx.fillStyle = C.gris; ctx.font = '400 34px "Atkinson Hyperlegible"'; ctx.fillText(t('portada.es'), MARGEN, 1490);
  ctx.fillStyle = C.noche; ajustar(ctx, E.nombre || '—', PW - 2 * MARGEN, 76, '800 {px}px "Bricolage Grotesque"'); ctx.fillText(E.nombre || '—', MARGEN, 1575);
  ctx.fillStyle = C.gris; ctx.font = '400 32px "Atkinson Hyperlegible"';
  ctx.fillText(`${fechaLarga()} · ${t('album.pegados', { n: pegados(), t: total() })}`, MARGEN, 1640);
  p.textos.push(t('titulo'), t('parque'), `${t('portada.es')} ${E.nombre || ''}`, fechaLarga(), t('album.pegados', { n: pegados(), t: total() }), 'Manizales', 'Nevado del Ruiz');
  return p;
}


// ---------- Una página por capítulo: cromos ganados y faltantes en silueta ----------
async function paginaCapitulo(k, n) {
  const p = pagina(), { ctx } = p, lista = cromosDe(k.id);
  const hechos = lista.filter((c) => abierto(c.id)).length;
  encabezado(p, `${k.num} · ${k.es}`, t('pdf.cromos', { n: hechos, t: lista.length }));
  const cols = 3, gap = 40, cw = (PW - 2 * MARGEN - (cols - 1) * gap) / cols, ch = cw * 4 / 3;
  const filas = Math.ceil(lista.length / cols);
  const escala = Math.min(1, (PH - 330 - 120) / (filas * (ch + gap)));
  const w = cw * escala, hh = ch * escala, x0 = (PW - (cols * w + (cols - 1) * gap)) / 2;
  for (let i = 0; i < lista.length; i++) {
    const c = lista[i], x = x0 + (i % cols) * (w + gap), y = 300 + Math.floor(i / cols) * (hh + gap);
    if (abierto(c.id)) { await frente(ctx, c.id, x, y, w); p.textos.push(`${num(c.n)} ${c.nombre}`); }
    else {
      ctx.strokeStyle = 'rgba(47,107,79,.4)'; ctx.setLineDash([12, 10]); ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(x, y, w, hh, 14); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.globalAlpha = 0.22; ctx.drawImage(await svgImg(arte(c, { silueta: true })), x + w * 0.12, y + hh * 0.14, w * 0.76, w * 0.76); ctx.restore();
      ctx.fillStyle = 'rgba(47,107,79,.55)'; ctx.font = `800 ${Math.round(w * 0.2)}px "Bricolage Grotesque"`; ctx.fillText(num(c.n), x + 22, y + hh - 28);
    }
  }
  pie(p, n);
  return p;
}

// ---------- Mi recorrido: estaciones en orden, con la hora en que llegaste ----------
async function paginaRecorrido(n) {
  const p = pagina(), { ctx } = p;
  encabezado(p, t('pdf.recorrido'), E.nombre || t('pdf.visitante'));
  const ests = estaciones().length ? estaciones() : ['brisas', 'aguacerales', 'arenales', 'lunares', 'tumbas'].map((id) => ({ id, nombre: nombreEstacion(id) }));
  const x = MARGEN + 40, y0 = 330, paso = Math.min(240, (PH - y0 - 220) / Math.max(1, ests.length - 1));
  ctx.strokeStyle = C.verde; ctx.lineWidth = 8; ctx.setLineDash([2, 22]); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + paso * (ests.length - 1)); ctx.stroke(); ctx.setLineDash([]);
  let alguna = false;
  ests.forEach((e, i) => {
    const y = y0 + paso * i, v = E.visitadas[e.id];
    ctx.fillStyle = v ? C.verde : C.papel2; ctx.strokeStyle = C.verde; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(x, y, 34, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = v ? C.amarillo : C.verde; ctx.font = '800 34px "Bricolage Grotesque"'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), x, y + 12); ctx.textAlign = 'left';
    ctx.fillStyle = C.noche; ctx.font = '800 46px "Bricolage Grotesque"'; ctx.fillText(e.nombre, x + 70, y + 4);
    ctx.fillStyle = C.gris; ctx.font = '400 30px "Atkinson Hyperlegible"';
    const linea = v ? `${fechaLarga(v)} · ${horaTxt(v)}` : '—';
    ctx.fillText(linea, x + 70, y + 46);
    p.textos.push(`${i + 1}. ${e.nombre} ${linea}`);
    if (v) alguna = true;
  });
  if (!alguna) { ctx.fillStyle = C.gris; ctx.font = '400 30px "Atkinson Hyperlegible"'; ctx.fillText(t('pdf.sinRecorrido'), MARGEN, PH - 160); p.textos.push(t('pdf.sinRecorrido')); }
  pie(p, n);
  return p;
}

// ---------- Certificado «Guardián del páramo» (con espacio para la firma del guía) ----------
async function certificado() {
  const p = pagina(), { ctx } = p;
  ctx.strokeStyle = C.verde; ctx.lineWidth = 10; ctx.strokeRect(60, 60, PW - 120, PH - 120);
  ctx.strokeStyle = C.amarillo; ctx.lineWidth = 4; ctx.strokeRect(84, 84, PW - 168, PH - 168);
  ctx.drawImage(await svgImg(personajes.fray(100)), PW / 2 - 150, 170, 300, 330);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.gris; ctx.font = '700 34px "Atkinson Hyperlegible"'; ctx.fillText(t('pdf.cert'), PW / 2, 580);
  ctx.fillStyle = C.verde; ajustar(ctx, t('pdf.guardian'), PW - 300, 112, '800 {px}px "Bricolage Grotesque"'); ctx.fillText(t('pdf.guardian'), PW / 2, 700);
  ctx.fillStyle = C.noche; ajustar(ctx, E.nombre || t('pdf.visitante'), PW - 300, 90, '800 {px}px "Bricolage Grotesque"'); ctx.fillText(E.nombre || t('pdf.visitante'), PW / 2, 840);
  ctx.fillStyle = C.noche; ctx.font = '400 36px "Atkinson Hyperlegible"';
  const motivo = t('pdf.certTxt');
  const lineasTxt = (s, y) => { const pal = s.split(' '); let l = ''; for (const w of pal) { const pr = l ? `${l} ${w}` : w; if (ctx.measureText(pr).width > PW - 300 && l) { ctx.fillText(l, PW / 2, y); y += 50; l = w; } else l = pr; } if (l) ctx.fillText(l, PW / 2, y); return y + 50; };
  const y = lineasTxt(motivo, 950);
  const cuenta = t('pdf.cromos', { n: pegados(), t: total() });
  ctx.font = '700 34px "Atkinson Hyperlegible"'; ctx.fillText(cuenta, PW / 2, y + 30);
  ctx.fillStyle = C.gris; ctx.font = '400 30px "Atkinson Hyperlegible"'; ctx.fillText(fechaLarga(), PW / 2, y + 90);
  ctx.strokeStyle = C.noche; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PW / 2 - 260, 1440); ctx.lineTo(PW / 2 + 260, 1440); ctx.stroke();
  ctx.fillStyle = C.gris; ctx.font = '400 26px "Atkinson Hyperlegible"'; ctx.fillText(t('pdf.firma'), PW / 2, 1480);
  ctx.font = '400 20px "Atkinson Hyperlegible"'; ctx.fillText(t('pdf.pie'), PW / 2, PH - 120);
  ctx.textAlign = 'left';
  p.textos.push(t('pdf.cert'), t('pdf.guardian'), E.nombre || '', motivo, cuenta, fechaLarga(), t('pdf.firma'));
  return p;
}

// ---------- Escritor de PDF mínimo: páginas A4 con una imagen JPEG y texto invisible ----------
const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
function cadenaPDF(s) {
  let o = '';
  for (const ch of String(s).normalize('NFC')) {
    let c = WIN[ch] ?? ch.codePointAt(0);
    if (c > 255) c = ch === '≈' ? 0x7e : 0x3f; // fuera de WinAnsi: ≈ → ~, el resto → ?
    const b = String.fromCharCode(c);
    o += b === '(' || b === ')' || b === '\\' ? `\\${b}` : b;
  }
  return `(${o})`;
}
export function armarPDF(paginas, { titulo = '' } = {}) {
  const A4W = 595.28, A4H = 841.89;
  const bytes = (s) => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; };
  const partes = [], ofs = []; let pos = 0;
  const put = (x) => { const b = typeof x === 'string' ? bytes(x) : x; partes.push(b); pos += b.length; };
  const obj = (id, dict, stream) => {
    ofs[id] = pos;
    put(`${id} 0 obj\n${dict}\n`);
    if (stream) { put('stream\n'); put(stream); put('\nendstream\n'); }
    put('endobj\n');
  };
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = paginas.length, kids = paginas.map((_, i) => `${5 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${kids}] >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4, `<< /Title ${cadenaPDF(titulo)} /Producer ${cadenaPDF('Album del Paramo')} /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z) >>`);
  paginas.forEach((pg, i) => {
    const id = 5 + i * 3;
    let txt = 'BT 3 Tr /F1 9 Tf 11 TL 36 805 Td\n';
    for (const s of pg.textos) txt += `${cadenaPDF(s)} Tj T*\n`;
    txt += 'ET\n';
    const contenido = bytes(`q ${A4W} 0 0 ${A4H} 0 0 cm /Im0 Do Q\n${txt}`);
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4W} ${A4H}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`);
    obj(id + 1, `<< /Length ${contenido.length} >>`, contenido);
    obj(id + 2, `<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>`, pg.jpeg);
  });
  const total = 5 + n * 3, xref = pos;
  let tabla = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) tabla += `${String(ofs[i]).padStart(10, '0')} 00000 n \n`;
  put(tabla);
  put(`trailer\n<< /Size ${total} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(partes, { type: 'application/pdf' });
}


export async function albumPDF({ alAvanzar = () => {} } = {}) {
  await fuentes();
  const caps = capitulos();
  const pasos = [() => portada(), ...caps.map((k, i) => () => paginaCapitulo(k, i + 2))];
  const nRec = pasos.length + 1;
  pasos.push(() => paginaRecorrido(nRec), () => certificado());
  const listas = [];
  for (let i = 0; i < pasos.length; i++) {
    const p = await pasos[i]();
    const blob = await new Promise((ok) => p.cv.toBlob(ok, 'image/jpeg', 0.84));
    listas.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w: PW, h: PH, textos: p.textos.filter(Boolean) });
    p.cv.width = p.cv.height = 0; // libera memoria del lienzo (importante en iPhone)
    alAvanzar((i + 1) / pasos.length);
    await new Promise((ok) => setTimeout(ok, 0));
  }
  return armarPDF(listas, { titulo: `${t('titulo')}${E.nombre ? ` · ${E.nombre}` : ''}` });
}

// Entrega un archivo: en iPhone con la hoja de compartir (Safari no guarda descargas de forma confiable);
// si no se puede, como descarga.
export async function entregar(blob, nombre) {
  const iOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (iOS && navigator.canShare) {
    const f = new File([blob], nombre, { type: blob.type });
    if (navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], title: t('titulo') }); return 'compartido'; }
      catch (e) { if (e.name === 'AbortError') return 'cancelado'; }
    }
  }
  descargar(blob, nombre);
  return 'descargado';
}

// Botones «Descargar mi álbum (PDF)» y «Collage»: muestran el avance en el mismo botón y no se pueden tocar dos veces
const nombreArchivo = (ext) => `album-del-paramo${E.nombre ? `-${E.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}` : ''}.${ext}`;
export async function botonPDF(btn) {
  if (btn.disabled) return;
  const antes = btn.textContent; btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  try {
    const pdf = await albumPDF({ alAvanzar: (f) => { btn.textContent = t('pdf.armando', { p: Math.round(f * 100) }); } });
    await entregar(pdf, nombreArchivo('pdf'));
  } catch (e) { console.error(e); btn.textContent = t('pdf.error'); setTimeout(() => (btn.textContent = antes), 3000); return; }
  finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  btn.textContent = antes;
}
