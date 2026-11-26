// Paridad y reglas del verificador: node pruebas/verificador.test.mjs
// - Casos del laboratorio (sin prefijo fray_): la capa base debe dar exactamente las fallas de slm.html (fallas_lab).
// - Todos: el veredicto completo (base + reglas del reto) debe ser el esperado (esperado_fray si existe) y contener falla_contiene.
import { readFileSync } from 'node:fs';
import { verificar, verificarBase, frases, respaldoLexico, fallasRespaldo } from '../js/verificador.js';

const { casos } = JSON.parse(readFileSync(new URL('./casos_verificador.json', import.meta.url), 'utf8'));
let mal = 0;
for (const c of casos) {
  const v = verificar(c.resp, c.fuente, c.pregunta, { relato: !!c.relato });
  const esperadoOk = (c.esperado_fray || c.esperado) === 'pasa';
  let bien = v.ok === esperadoOk && (c.falla_contiene || []).every((x) => v.fallas.some((f) => f.includes(x)));
  let paridad = true;
  if (c.fallas_lab) {
    const b = verificarBase(c.resp, c.fuente, c.pregunta);
    paridad = JSON.stringify(b.fallas) === JSON.stringify(c.fallas_lab);
  }
  if (!bien || !paridad) mal++;
  console.log(`${bien && paridad ? 'ok ' : 'MAL'} ${c.id.padEnd(30)} ${v.ok ? 'pasa' : 'bloquea'}${paridad ? '' : ' [PARIDAD ROTA]'} ${v.fallas.join('; ')}`);
}
const lab = casos.filter((c) => c.fallas_lab).length;
console.log(`\n${casos.length - mal}/${casos.length} casos bien · paridad con slm.html en ${lab} casos del laboratorio`);
// Respaldo por frase: «3 de los 6 glaciares» no puede volverse «6 glaciares»; la copia fiel pasa.
const G = frases('Colombia tiene 6 glaciares. Según el IDEAM, 3 de los 6 glaciares podrían desaparecer en las próximas décadas.');
for (const [resp, debeFallar] of [['Los 6 glaciares llegarán a desaparecer en las próximas décadas.', true],
  ['Según el IDEAM, 3 de los 6 glaciares podrían desaparecer en las próximas décadas.', false],
  ['Los glaciares se derriten porque el viento sopla muy fuerte.', true]]) {
  const f = fallasRespaldo(respaldoLexico(frases(resp), G, { pregunta: '¿van a desaparecer los glaciares?' }));
  const bien = (f.length > 0) === debeFallar; if (!bien) mal++;
  console.log(`${bien ? 'ok ' : 'MAL'} respaldo: ${resp} ${f.join('; ')}`);
}
process.exit(mal ? 1 : 0);
