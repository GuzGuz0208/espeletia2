// Prueba de la vigencia del contenido (contrato §7, decisión 11) con reloj simulado.
// Uso: node pruebas/test_vigencia.mjs
// activar → responder → adelantar 24 h → contenido borrado y Fray no responde fichas (el carril de seguridad sí) →
// sin red no renueva (no hay copia vieja) → con red renueva 24 h → reloj hacia atrás = vencido.
// El motor corre en Node en modo solo léxico (sin Worker ni modelo), que basta para comprobar la puerta.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (r) => import(pathToFileURL(path.join(RAIZ, r)).href);
const textoPaquete = fs.readFileSync(path.join(RAIZ, 'contenido', 'paquete.json'), 'utf8').replace(/^﻿/, '');
const PAQUETE = JSON.parse(textoPaquete);
const H = 3600 * 1000;

let pasos = 0;
const ok = (msg) => console.log(`  ok ${++pasos} · ${msg}`);

// ---------- dobles: reloj, localStorage, caché del service worker, red ----------
let T = Date.parse('2026-11-26T08:00:00-05:00');
let M = 0; // reloj monótono (performance.now)
const ls = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; })();

const entradas = new Map(); // url → texto (caché «fray-v6»)
const cacheSW = {
  async keys() { return [...entradas.keys()].map((url) => ({ url })); },
  async delete(req) { return entradas.delete(req.url); },
};
globalThis.caches = { async keys() { return ['fray-v6']; }, async open() { return cacheSW; } };
const ORIGEN = 'https://espeletia2.vercel.app/';
for (const r of ['contenido/paquete.json', 'contenido/indice.json', 'contenido/clave_publica.json', 'ejemplo/paquete-ejemplo.json',
  'index.html', 'js/fray.js', 'models/partes.json', 'models/e5_tokenizer.json', 'lib/ort.wasm.min.js']) entradas.set(ORIGEN + r, 'x');

let enLinea = true;
const pedidos = [];
// Como el navegador con el service worker: con red, el servidor; sin red, solo lo que quede en caché.
async function fetchSimulado(url, init) {
  pedidos.push({ url, init });
  const ruta = String(url).split('?')[0];
  if (enLinea) return { ok: true, status: 200, json: async () => JSON.parse(textoPaquete) };
  if (entradas.has(ORIGEN + ruta)) return { ok: true, status: 200, json: async () => JSON.parse(textoPaquete) };
  throw new TypeError('Failed to fetch');
}

const vig = await imp('js/vigencia.js');
const sync = await imp('js/sync.js');
const fray = await imp('js/fray.js');
const sesion = () => vig.configurar({ ahora: () => T, mono: () => M, ls, fetch: fetchSimulado, enLinea: () => enLinea });
sesion();

const almacen = sync.crearAlmacenMemoria();
sync.iniciarSync({ almacen }); // sin urlBase: no usa la red
await almacen.set('paquete_actual', { version: PAQUETE.version, paquete: PAQUETE });
await almacen.set('paquete_anterior', { version: '0', paquete: PAQUETE });
await almacen.set('avisos', { sha256: 'x', avisos: [{ tipo: 'operativo', texto: 'Sendero cerrado' }] });
await almacen.set('cola', [{ id: 'a', texto: 'pregunta sin enviar' }]);
await almacen.set('dispositivo', 'dev-1');
ls.setItem('fray.sinRespuesta', '[{"texto":"x"}]');
ls.setItem('fray.ajustes', '{"letra":"2"}');

const ficha = PAQUETE.fichas.find((f) => !f.bloqueada && f.estado !== 'borrador' && f.preguntas?.length);
const PREGUNTA = ficha.preguntas[0];

// ---------- 1. activar ----------
assert.equal(vig.estadoVigencia().estado, 'sin-activar');
let e = vig.activarSiPrimeraVez(PAQUETE.vigenciaHoras);
assert.equal(e.estado, 'vigente');
assert.equal(e.venceEn, T + 24 * H, 'por defecto 24 h');
const t0 = T;
assert.equal(vig.activarSiPrimeraVez(5).venceEn, t0 + 24 * H, 'la segunda carga no reinicia la vigencia');
ok(`primera carga activa la vigencia: vence ${new Date(e.venceEn).toISOString()}`);

// ---------- 2. responder ----------
await fray.cargar(PAQUETE);
let r = await fray.preguntar(PREGUNTA);
assert.equal(r.tipo, 'respuesta', `«${PREGUNTA}» debía responder con ficha (dio ${r.tipo})`);
ok(`vigente: Fray responde «${PREGUNTA}» con la ficha ${r.fichas?.[0] || ''}`);

// ---------- 3. aviso 1 h antes ----------
T = t0 + 23.5 * H; M += 23.5 * H;
e = vig.verificarVigencia();
assert.equal(e.estado, 'vigente'); assert.equal(e.pronto, true);
assert.ok(Math.abs(e.restanteMs - 0.5 * H) < 1000);
ok('a las 23,5 h sigue vigente y marca «pronto» (aviso 1 h antes)');

// ---------- 4. adelantar a 24 h ----------
T = t0 + 24 * H + 60000; M += 0.5 * H + 60000;
e = vig.verificarVigencia();
assert.equal(e.estado, 'vencido'); assert.equal(e.motivo, 'tiempo'); assert.equal(e.restanteMs, 0);
ok('a las 24 h + 1 min queda vencido');

r = await fray.preguntar(PREGUNTA);
assert.equal(r.tipo, 'vencido'); assert.deepEqual(r.fichas, []); assert.deepEqual(r.citas, []);
ok('vencido: Fray no responde con fichas (tipo «vencido», sin citas)');
for (const q of ['me siento mareado y me duele la cabeza', 'mi amigo se cayó y está sangrando', '¿el volcán está en alerta hoy?', '¿me puedo comer esta planta?']) {
  r = await fray.preguntar(q);
  assert.equal(r.tipo, 'seguridad', q);
  assert.deepEqual(r.citas, []);
}
ok('vencido: el carril de seguridad sigue (salud, emergencia, volcán, comer → remiten al guía, sin contenido del parque)');

// ---------- 5. borrar ----------
const res = await vig.borrarContenido();
for (const k of ['paquete_actual', 'paquete_anterior', 'avisos']) assert.equal(await almacen.get(k), undefined, k);
assert.equal(await sync.paqueteGuardado(), null);
assert.deepEqual(await sync.avisosVigentes(), []);
assert.equal((await almacen.get('cola')).length, 1, 'la cola sin enviar se conserva');
assert.equal(ls.getItem('fray.sinRespuesta'), null);
assert.equal(ls.getItem('fray.ajustes'), '{"letra":"2"}', 'los ajustes de la app se conservan');
const quedan = [...entradas.keys()].map((u) => u.replace(ORIGEN, ''));
assert.deepEqual(quedan.filter((u) => /^(contenido|ejemplo)\//.test(u)), []);
for (const u of ['index.html', 'js/fray.js', 'models/partes.json', 'models/e5_tokenizer.json', 'lib/ort.wasm.min.js']) assert.ok(quedan.includes(u), u);
ok(`borrado: paquetes de sync y avisos, lista local sin respuesta y ${res.caches} entradas de contenido/ y ejemplo/ en el caché; se conservan app, motor, modelo, ajustes y la cola sin enviar`);

// ---------- 6. no se renueva sin red ----------
enLinea = false;
let rn = await vig.renovar();
assert.equal(rn.ok, false);
assert.equal(vig.verificarVigencia().estado, 'vencido');
// Aunque navigator.onLine mienta (dice «en línea» sin señal real), la copia vieja ya no está en el caché
const sinSenal = async (url, init) => { const ruta = String(url).split('?')[0]; if (entradas.has(ORIGEN + ruta)) return fetchSimulado(url, init); throw new TypeError('Failed to fetch'); };
vig.configurar({ enLinea: () => true, fetch: sinSenal });
rn = await vig.renovar();
assert.equal(rn.ok, false, 'sin señal no hay copia vieja de donde renovar');
assert.equal(vig.verificarVigencia().estado, 'vencido');
const st = await vig.asegurarVigencia();
assert.equal(st.estado, 'vencido');
ok('sin red no se renueva (ni con navigator.onLine engañado): sigue vencido');

// ---------- 7. con red renueva ----------
enLinea = true;
vig.configurar({ enLinea: () => enLinea, fetch: fetchSimulado });
pedidos.length = 0;
rn = await vig.renovar();
assert.equal(rn.ok, true, rn.motivo);
assert.match(pedidos[0].url, /^contenido\/paquete\.json\?renovar=\d+$/);
assert.equal(pedidos[0].init.cache, 'no-store');
e = vig.verificarVigencia();
assert.equal(e.estado, 'vigente'); assert.equal(e.venceEn, T + 24 * H);
await fray.cargar(PAQUETE);
r = await fray.preguntar(PREGUNTA);
assert.equal(r.tipo, 'respuesta');
ok(`con red renueva: descarga contenido/paquete.json (no-store), vence ${new Date(e.venceEn).toISOString()} y Fray vuelve a responder`);

// ---------- 8. reloj hacia atrás ----------
T += 2 * H; M += 2 * H;
vig.verificarVigencia(); // última hora vista
// Con la app abierta: atrasar el reloj no alarga nada (reloj monótono)
const antes = vig.estadoVigencia().restanteMs;
T -= 5 * H;
assert.ok(vig.estadoVigencia().restanteMs <= antes, 'el reloj monótono no deja ganar tiempo');
// Al reabrir la app con el reloj 5 h atrás: vencido por reloj
sesion();
e = vig.verificarVigencia();
assert.equal(e.estado, 'vencido'); assert.equal(e.motivo, 'reloj');
ok('reloj atrasado más de 10 min respecto a la última hora vista → vencido (motivo «reloj»)');
// Un retroceso pequeño (5 min) no vence
T += 5 * H; enLinea = true; await vig.renovar();
T -= 5 * 60000; sesion();
assert.equal(vig.verificarVigencia().estado, 'vigente');
ok('retroceso de 5 min (ajuste de hora normal) no vence');

// ---------- 9. vigenciaHoras configurable ----------
const otra = { ...PAQUETE, vigenciaHoras: 2 };
vig.configurar({ fetch: async () => ({ ok: true, status: 200, json: async () => otra }) });
ls.removeItem('fray.vigencia');
e = vig.activarSiPrimeraVez(otra.vigenciaHoras);
assert.equal(e.venceEn, T + 2 * H);
ok('vigenciaHoras del paquete se respeta (2 h)');

console.log(`\nVigencia: ${pasos} comprobaciones en verde.`);
process.exit(0);
