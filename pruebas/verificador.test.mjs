// Paridad y reglas del verificador: node pruebas/verificador.test.mjs
// - Casos del laboratorio (sin prefijo fray_): la capa base debe dar exactamente las fallas de slm.html (fallas_lab).
// - Todos: el veredicto completo (base + reglas del reto) debe ser el esperado (esperado_fray si existe) y contener falla_contiene.
import { readFileSync } from 'node:fs';
import { verificar, verificarBase, frases, respaldoLexico, fallasRespaldo, cifras } from '../js/verificador.js';

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
// Casos medidos en el REDMI y en resultados-modelos-guion.md (26-nov), contra el texto real de la ficha del paquete.
const paq = JSON.parse(readFileSync(new URL('../contenido/paquete.json', import.meta.url), 'utf8'));
const fuenteDe = (id) => { const f = paq.fichas.find((x) => x.id === id); return frases((f.texto || '') + ' ' + (f.breve || '')); };
for (const [id, preg, resp, debeFallar, motivo] of [
  ['uton-aguacerales-ficha', '¿a qué altura está Aguacerales?', 'Estamos a 4.160 msnm aproximadamente, ubicados en el flanco occidental del edificio volcánico a 5.2 km del Cráter Arenas.', false, 'cifra de la frase vecina (falso positivo del REDMI)'],
  ['uton-aguacerales-ficha', '¿a qué altura está Aguacerales?', 'Aguacerales está a 4160 msnm aproximadamente.', false, '4160 = 4.160'],
  ['uton-aguacerales-ficha', '¿a qué altura está Aguacerales?', 'Aguacerales está a 4,160 msnm aproximadamente.', false, '4,160 = 4.160'],
  ['uton-aguacerales-ficha', '¿A qué altura estamos?', 'Estamos a 3.000 metros sobre el nivel del mar.', true, 'cifra inventada'],
  ['uton-arenales-viento-rocas', '¿Esas rocas enormes las tiró el volcán?', 'Sí, esas rocas enormes son las que dejaron el volcán tras el retroceso glaciar.', true, 'pierde la negación'],
  ['uton-grandes-mamiferos', '¿Qué animales grandes hay en el parque?', 'Hay venados de cola blanca en el páramo.', true, 'omite que desapareció'],
  ['uton-grandes-mamiferos', '¿Qué animales grandes hay en el parque?', 'Los grandes mamíferos son vulnerables a la extinción por la cacería, por lo que han desaparecido de muchos páramos, como el venado de cola blanca en el PNN Los Nevados.', false, 'paráfrasis fiel'],
]) {
  const f = fallasRespaldo(respaldoLexico(frases(resp), fuenteDe(id), { pregunta: preg }), { pregunta: preg });
  const bien = (f.length > 0) === debeFallar; if (!bien) mal++;
  console.log(`${bien ? 'ok ' : 'MAL'} respaldo (${motivo}): ${resp.slice(0, 70)} ${f.join('; ')}`);
}
for (const [a, b] of [['4.160', '4160'], ['4,160', '4160'], ['4 160', '4160'], ['2,24', '2.24']]) {
  const bien = cifras(a).join() === cifras(b).join(); if (!bien) mal++;
  console.log(`${bien ? 'ok ' : 'MAL'} cifras: «${a}» = «${b}»`);
}
process.exit(mal ? 1 : 0);
