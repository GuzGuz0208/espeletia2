// Conversación de Fray (js/conversacion.js) en modo solo léxico: node pruebas/conversacion.test.mjs
// Simula fray.preguntar: carril → charla → búsqueda (nucleo.decidir sin vectores) → anotar.
import { readFileSync } from 'node:fs';
import { carril } from '../js/carril.js';
import { preparar, decidir, PARAMS_DEFECTO } from '../js/nucleo.js';
import { conversar, anotar, nuevaConversacion, intencion, sinCharla } from '../js/conversacion.js';

const paq = JSON.parse(readFileSync(new URL('../contenido/paquete.json', import.meta.url), 'utf8'));
const idx = preparar(paq);
const P = { ...PARAMS_DEFECTO, ...JSON.parse(readFileSync(new URL('../models/fray-params.json', import.meta.url), 'utf8')).params };
let estado = nuevaConversacion();
function preguntar(texto, estacion = null) {
  const s = carril(texto); if (s) return s;
  const c = conversar(texto, { paquete: paq, estacion, estado }); if (c) return c;
  const r = decidir(idx, null, sinCharla(texto), { estacion }, P); anotar(estado, r, paq); return r;
}
let mal = 0;
const caso = (texto, est, tipo, extra = () => true) => {
  const r = preguntar(texto, est); const bien = r.tipo === tipo && extra(r); if (!bien) mal++;
  console.log(`${bien ? 'ok ' : 'MAL'} ${JSON.stringify(texto).padEnd(42)} ${String(est).padEnd(11)} → ${r.tipo}${r.intencion ? '/' + r.intencion : ''}${r.seguimiento ? '/' + r.seguimiento : ''} ${(r.fichas || []).join(',')} ${(r.citas || []).map((c) => c.guion + ' p.' + c.pagina).join(',')} | ${(r.breve || '').slice(0, 70)}${r.sugerencias ? ' | sug: ' + r.sugerencias.join(' · ') : ''}`);
  return r;
};
caso('Hola', 'lunares', 'charla', (r) => r.sugerencias.length === 3);
caso('hola', null, 'charla', (r) => r.sugerencias.length === 3);
caso('¿qué puedes hacer?', null, 'charla', (r) => r.intencion === 'ayuda');
caso('¿Quién eres?', null, 'charla', (r) => r.intencion === 'quien');
caso('amplía', null, 'charla', (r) => r.intencion === 'mas');
caso('hola, me siento mareado', null, 'seguridad');
caso('gracias, ¿me puedo comer esta planta?', null, 'seguridad');
const r1 = caso('hola, ¿qué es la gelifracción?', 'lunares', 'respuesta');
const r2 = caso('¿puedes complementarlo mejor?', 'lunares', 'respuesta', (r) => r.fichas[0] === r1.fichas[0] && r.breve !== r1.breve && r.citas.length > 0);
caso('cuéntame más', 'lunares', 'respuesta', (r) => r.breve !== r2.breve);
caso('no entendí', 'lunares', 'respuesta', (r) => r.citas.length > 0);
caso('más sencillo por favor', 'lunares', 'respuesta');
caso('gracias', 'lunares', 'charla');
caso('jaja', null, 'charla', (r) => r.intencion === 'corta');
caso('ok', null, 'charla');
caso('chao', null, 'charla', (r) => r.intencion === 'despedida');
for (let i = 0; i < 6; i++) caso('más detalles', 'lunares', 'respuesta');
for (const [a, b] of [['hola fray, ¿qué es la gelifracción?', '¿qué es la gelifracción?'], ['Buenas tardes. Qué es esto', 'Qué es esto'], ['hola', 'hola'], ['¿por qué se rompen?', '¿por qué se rompen?']]) {
  const x = sinCharla(a); const bien = x === b; if (!bien) mal++; console.log(`${bien ? 'ok ' : 'MAL'} sinCharla ${JSON.stringify(a)} → ${JSON.stringify(x)}`);
}
caso('¿y eso?', null, 'respuesta');
for (const [t, e] of [['hola fray', 'saludo'], ['buenas tardes', 'saludo'], ['explícame mejor', 'mas'], ['explícame más sencillo', 'sencillo'], ['¿qué?', 'sencillo'],
  ['hola, ¿qué es el frailejón?', null], ['¿qué es el frailejón?', null], ['thank you', 'gracias'], ['what can you do?', 'ayuda'], ['sí', 'corta'], ['muchas gracias fray', 'gracias']]) {
  const b = intencion(t) === e; if (!b) mal++; console.log(`${b ? 'ok ' : 'MAL'} intención ${JSON.stringify(t)} → ${intencion(t)}`);
}
process.exit(mal ? 1 : 0);
