// Calibra el respaldo por frase con pruebas/casos_respaldo.json: para cada umbral, cuántas respuestas correctas descarta
// (falsos rechazos) y cuántos errores atrapa. Las cifras de los casos ya pasaron el verificador de cifras y nombres.
//   node herramientas/calibrar_respaldo.mjs [--detalle 0.5]
import { readFileSync } from 'node:fs';
import { frases, clausulas, respaldoLexico, fallasRespaldo } from '../js/verificador.js';

const { casos } = JSON.parse(readFileSync(new URL('../pruebas/casos_respaldo.json', import.meta.url), 'utf8'));
const quitar = (t) => t.replace(/^(S[ií], |No, )?Seg[uú]n la tradici[oó]n oral, /i, '');
const PARTIR = process.env.PARTIR === "clausulas" ? clausulas : frases; const VENT = Number(process.env.VENTANA || 1);
const evaluados = casos.map((c) => ({ ...c, res: respaldoLexico(PARTIR(quitar(c.resp)), frases(c.fuente), { pregunta: c.pregunta, ventana: VENT }) }));
console.log(`partir: ${process.env.PARTIR || "frases"} · ventana: ${VENT}`);
const buenos = evaluados.filter((c) => !c.error).length; const malos = evaluados.length - buenos;
console.log(`${evaluados.length} casos: ${buenos} correctos, ${malos} con error\n`);
console.log('umbral | falsos rechazos (correctas descartadas) | errores atrapados');
for (const u of [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7]) {
  let fr = 0, at = 0;
  for (const c of evaluados) { const rechaza = fallasRespaldo(c.res, { umbral: u }).length > 0; if (c.error && rechaza) at++; if (!c.error && rechaza) fr++; }
  console.log(`${u.toFixed(2).padStart(6)} | ${String(fr).padStart(3)}/${buenos} (${Math.round(100 * fr / buenos)} %) | ${at}/${malos}`);
}
const i = process.argv.indexOf('--detalle');
if (i > 0) {
  const u = Number(process.argv[i + 1]);
  console.log(`\nDetalle con umbral ${u}:`);
  for (const c of evaluados) {
    const f = fallasRespaldo(c.res, { umbral: u });
    const tag = c.error ? (f.length ? 'ATRAPA ' : 'SE ESCAPA') : (f.length ? 'RECHAZO' : 'ok     ');
    if (tag !== 'ok     ') console.log(`${tag} ${c.id} [${c.res.map((r) => r.sim).join(',')}] ${c.resp.slice(0, 110)}${c.error ? '\n          error: ' + c.error : ''}${f.length ? '\n          falla: ' + f.join('; ') : ''}`);
  }
}
