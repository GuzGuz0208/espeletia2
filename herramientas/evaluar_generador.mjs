// Calidad del generador con el contenido real: para cada pregunta se usa la ficha CORRECTA (sin búsqueda) como r y se llama
// a js/generador.js contra el llama-server que esté corriendo en 127.0.0.1:8080 (uno por modelo).
//
//   node herramientas/evaluar_generador.mjs --paquete contenido/paquete.json [--preguntas contenido/preguntas_desarrollo.json]
//        [--contexto breve|ficha] [--n 18] [--etiqueta q25-1.5b] [--salida pruebas/resultados/gen-q25-breve.json]
//
// Sin --preguntas toma, de forma determinista, la 1.ª pregunta en español de N fichas no bloqueadas repartidas por tipo, y
// añade 4 trampas (pregunta que la ficha dada NO responde: el modelo debe abstenerse o el verificador atrapar el invento).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as g from '../js/generador.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const paquete = JSON.parse(readFileSync(arg('paquete', 'contenido/paquete.json'), 'utf8'));
const contexto = arg('contexto', 'breve');
const N = Number(arg('n', 18));
const fichas = Object.fromEntries(paquete.fichas.map((f) => [f.id, f]));
const usables = paquete.fichas.filter((f) => !f.bloqueada && (f.preguntas || []).length);

let casos = [];
const archivoPreg = arg('preguntas');
if (archivoPreg) {
  const raw = JSON.parse(readFileSync(archivoPreg, 'utf8'));
  const lista = Array.isArray(raw) ? raw : raw.preguntas || raw.casos || [];
  for (const q of lista) {
    const esp = q.esperado || {};
    if (esp.tipo && esp.tipo !== 'respuesta') continue;   // seguridad, abstención y conflictos no pasan por el modelo
    const id = q.ficha || q.id_ficha || (esp.fichas || q.fichas || [])[0];
    const texto = q.pregunta || q.texto || q.p;
    if (texto && id && fichas[id] && !fichas[id].bloqueada) casos.push({ id: q.id || id, pregunta: texto, ficha: id, trampa: false });
  }
  casos = casos.slice(0, N);
} else {
  const porTipo = {};
  for (const f of usables) (porTipo[f.tipo] ||= []).push(f);
  const tipos = Object.keys(porTipo);
  for (let i = 0; casos.length < N && i < 100; i++) {
    const f = porTipo[tipos[i % tipos.length]][Math.floor(i / tipos.length)];
    if (!f) continue;
    const p = f.preguntas.find((x) => !/^(is|what|why|how|where|when|can|do|does|who)\b/i.test(x)) || f.preguntas[0];
    casos.push({ id: f.id, pregunta: p, ficha: f.id, trampa: false });
  }
}
// Trampas: pregunta con dato concreto que la ficha dada no trae.
const TRAMPAS = [
  ['¿cuánto pesa un cóndor adulto?', 'fauna'], ['¿cuántos frailejones hay en el parque?', 'flora'],
  ['¿a qué temperatura está el agua de la laguna hoy?', 'agua'], ['¿cuántos visitantes vienen al año?', 'normas'],
];
for (const [p, tema] of TRAMPAS) {
  const f = usables.find((x) => x.tema === tema && x.tipo !== 'relato') || usables[0];
  casos.push({ id: 'trampa-' + tema, pregunta: p, ficha: f.id, trampa: true });
}

const d = await g.disponible();
if (!d.listo) { console.error('No hay llama-server en 127.0.0.1:8080'); process.exit(1); }
await g.calentar();
const out = [];
for (const c of casos) {
  const f = fichas[c.ficha];
  const r = { tipo: 'respuesta', breve: f.breve, ampliar: f.texto, tipoContenido: f.tipo, citas: f.citas, fichas: [f.id] };
  const res = await g.reescribir(r, c.pregunta, { timeoutMs: 60000, contexto });
  out.push({ ...c, tipo: f.tipo, breve: f.breve, ...res });
  console.log(`${res.ok ? 'PASA ' : 'GUION'} ${c.trampa ? '[T] ' : ''}${c.id.slice(0, 28).padEnd(28)} ${String(res.primeraMs).padStart(5)} / ${String(res.ms).padStart(5)} ms  ${c.pregunta}\n      → ${res.texto}${res.ok ? '' : '\n        fallas: ' + res.fallas.join('; ')}`);
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const resumen = {
  etiqueta: arg('etiqueta', d.modelo), modelo: d.modelo, contexto, fecha: new Date().toISOString(),
  pasan: out.filter((x) => !x.trampa && x.ok).length, puntuales: out.filter((x) => !x.trampa).length,
  trampas_bloqueadas: out.filter((x) => x.trampa && !x.ok).length, trampas: out.filter((x) => x.trampa).length,
  primera_mediana_ms: med(out.map((x) => x.primeraMs).filter((x) => x != null)), total_mediana_ms: med(out.map((x) => x.ms)),
};
console.log('\n' + JSON.stringify(resumen));
const salida = arg('salida');
if (salida) { mkdirSync(dirname(salida), { recursive: true }); writeFileSync(salida, JSON.stringify({ resumen, casos: out }, null, 1)); }
