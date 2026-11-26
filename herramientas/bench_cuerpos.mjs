// Genera herramientas/bench_cuerpos/*.json (cuerpos de /v1/chat/completions, sin streaming) desde bench_preguntas.json con el
// MISMO prompt de js/generador.js, para que bench_dispositivo.(sh|ps1) mida lo mismo que la app sin necesitar node.
//   node herramientas/bench_cuerpos.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { mensajes, PARAMS, SISTEMA } from '../js/generador.js';
const dir = new URL('./bench_cuerpos/', import.meta.url);
mkdirSync(dir, { recursive: true });
const { preguntas } = JSON.parse(readFileSync(new URL('./bench_preguntas.json', import.meta.url), 'utf8'));
const cuerpo = (messages) => JSON.stringify({ ...PARAMS, stream: false, messages });
writeFileSync(new URL('0-calentar.json', dir), cuerpo([{ role: 'system', content: SISTEMA }, { role: 'user', content: 'PREGUNTA: «hola»\nTEXTO DEL GUION: Hola.' }]));
preguntas.forEach((q, i) => {
  const { messages } = mensajes({ tipo: 'respuesta', breve: q.breve, tipoContenido: q.tipoContenido }, q.pregunta);
  writeFileSync(new URL(`${i + 1}-${q.id}.json`, dir), cuerpo(messages));
});
console.log(`${preguntas.length + 1} cuerpos en herramientas/bench_cuerpos/`);
