// Paridad y reglas del verificador: node pruebas/verificador.test.mjs
// - Casos del laboratorio (sin prefijo fray_): la capa base debe dar exactamente las fallas de slm.html (fallas_lab).
// - Todos: el veredicto completo (base + reglas del reto) debe ser el esperado (esperado_fray si existe) y contener falla_contiene.
import { readFileSync } from 'node:fs';
import { verificar, verificarBase } from '../js/verificador.js';

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
process.exit(mal ? 1 : 0);
