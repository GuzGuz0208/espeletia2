// Paridad del verificador: corre los casos de test/casos_verificador.json con la función verificar() de
// laboratorio/slm.html (la fuente de verdad) y compara con el «esperado» guardado, que es lo que también
// exige test/verificador_test.dart a la versión Dart.
//
// Uso (desde nativo/):
//   node herramientas/paridad_verificador.mjs             comprueba (sale con 1 si algo difiere)
//   node herramientas/paridad_verificador.mjs --escribir  recalcula «esperado» con el JS de slm.html
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(aqui, '..', '..', 'laboratorio', 'slm.html'), 'utf8');
const lineaNorm = html.match(/^const norm = .*$/m)[0];
const i = html.indexOf('// ---------- Verificador determinista');
const j = html.indexOf('// ---------- Worker');
if (i < 0 || j < 0) throw new Error('No encontré el verificador en laboratorio/slm.html');
const verificar = new Function(`${lineaNorm}\n${html.slice(i, j)}\nreturn verificar;`)();

const rutaCasos = join(aqui, '..', 'test', 'casos_verificador.json');
const datos = JSON.parse(readFileSync(rutaCasos, 'utf8'));
const escribir = process.argv.includes('--escribir');
let malos = 0;
for (const c of datos.casos) {
  const v = verificar(c.resp, c.fuente, c.pregunta);
  if (escribir) c.esperado = v;
  else if (JSON.stringify(v) !== JSON.stringify(c.esperado)) {
    malos++;
    console.log(`DIFIERE  ${c.nombre}\n  JS:       ${JSON.stringify(v)}\n  esperado: ${JSON.stringify(c.esperado)}`);
  }
}
if (escribir) {
  writeFileSync(rutaCasos, JSON.stringify(datos, null, 1) + '\n');
  console.log(`Escribí ${datos.casos.length} casos con el verificador de slm.html`);
} else {
  console.log(malos ? `${malos} caso(s) difieren` : `ok  ${datos.casos.length} casos iguales a slm.html`);
  process.exit(malos ? 1 : 0);
}
