// Prueba de las actualizaciones obligatorias en modo estático (decisión 12, contrato §5.8).
// Uso: node pruebas/test_actualizaciones.mjs   (Python con `cryptography`; variable PYTHON para otro intérprete)
// Simula el despliegue de Vercel: un servidor estático que solo sirve GET /publicado/* (POST → 405). El cliente
// (js/sync.js) nunca recibe una llamada a mano: todo lo dispara el arranque, el evento `online` y sus reintentos.
// Todo en una carpeta temporal y en 127.0.0.1: no toca contenido/clave_publica.json ni la clave real.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PY = process.env.PYTHON || 'python';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fray-act-'));
const D = { claves: path.join(TMP, 'claves'), publica: path.join(TMP, 'clave_publica.json'), publicado: path.join(TMP, 'publicado') };

// Ventana con eventos (el `online` del navegador)
const ventana = new EventTarget();
globalThis.addEventListener = ventana.addEventListener.bind(ventana);
globalThis.removeEventListener = ventana.removeEventListener.bind(ventana);
const recuperarSenal = () => ventana.dispatchEvent(new Event('online'));

const sync = await import(pathToFileURL(path.join(RAIZ, 'js', 'sync.js')).href);
const vig = await import(pathToFileURL(path.join(RAIZ, 'js', 'vigencia.js')).href);

let pasos = 0;
const ok = (msg) => console.log(`  ok ${++pasos} · ${msg}`);

function publicar(paquete) {
  const r = spawnSync(PY, ['-X', 'utf8', path.join(RAIZ, 'herramientas', 'firmar_paquete.py'), '--paquete', paquete,
    '--salida', D.publicado, '--claves', D.claves, '--clave-publica', D.publica], { encoding: 'utf8', cwd: RAIZ });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
}

// Espera activa con un temporizador normal (los de sync.js usan unref y no mantienen vivo el proceso)
async function esperar(cond, ms, que) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`tiempo agotado esperando: ${que}`);
}

const subirUltimo = (v) => v.replace(/(\d+)(?!.*\d)/, (n) => String(Number(n) + 1));

// --- «Vercel»: estático, solo GET de /publicado/*
const posts = [];
const servidor = http.createServer((req, res) => {
  if (req.method !== 'GET') { posts.push(req.url); res.writeHead(405).end(); return; }
  const ruta = new URL(req.url, 'http://x').pathname;
  const m = ruta.match(/^\/publicado\/(manifest|paquete|avisos)\.json$/);
  const f = m && path.join(D.publicado, `${m[1]}.json`);
  if (!f || !fs.existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(fs.readFileSync(f));
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const ORIGEN = `http://127.0.0.1:${servidor.address().port}`;

// Señal intermitente: se puede hacer fallar las próximas N descargas de paquete.json
let fallarPaquete = 0;
let fallosVistos = 0;
const fetchIntermitente = (url, op) => {
  if (/\/paquete\.json/.test(url) && fallarPaquete > 0) {
    fallarPaquete -= 1; fallosVistos += 1;
    return Promise.reject(new TypeError('fetch failed (señal intermitente)'));
  }
  return fetch(url, op);
};

try {
  // --- configuración del despliegue
  const vercel = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
  const h = vercel.headers.find((x) => x.source === '/publicado/(.*)');
  assert.ok(h?.headers.some((x) => x.key === 'Cache-Control' && x.value === 'no-store'), 'vercel.json: no-store en /publicado/');
  assert.ok(!/^publicado\/\s*$/m.test(fs.readFileSync(path.join(RAIZ, '.vercelignore'), 'utf8')), '.vercelignore no excluye publicado/');
  const ign = (f) => spawnSync('git', ['check-ignore', '-q', f], { cwd: RAIZ }).status === 0;
  for (const f of ['manifest.json', 'paquete.json', 'avisos.json']) assert.ok(!ign(`publicado/${f}`), `publicado/${f} entra en git`);
  assert.ok(ign('publicado/fray-paquete-usb.json') && ign('publicado/fray_privada.pem'), 'el resto de publicado/ queda fuera de git');
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  assert.match(sw, /startsWith\('\/publicado\/'\)\) return;/, 'sw.js deja pasar /publicado/ sin caché');
  assert.match(sw, /skipWaiting\(\)/); assert.match(sw, /clients\.claim\(\)/);
  ok('vercel.json no-store, publicado/ en git (solo 3 archivos), sw.js sin caché para /publicado/, skipWaiting + claim');

  // --- v1 publicada → el teléfono la activa solo al abrir
  const v1 = JSON.parse(fs.readFileSync(path.join(RAIZ, 'contenido', 'paquete.json'), 'utf8'));
  publicar(path.join(RAIZ, 'contenido', 'paquete.json'));
  const jwk = JSON.parse(fs.readFileSync(D.publica, 'utf8'));
  const activados = [];
  sync.iniciarSync({
    urlBase: `${ORIGEN}/publicado`, clavePublicaJwk: jwk, almacen: sync.crearAlmacenMemoria(), versionLocal: '2000-01-01.1',
    primerIntentoMs: 10, intervaloMin: 60, reintentoSeg: 0.05, fetch: fetchIntermitente,
    alPaqueteNuevo: (p, info) => { activados.push({ version: info.version, origen: info.origen, fichas: p.fichas.length }); },
  });
  await esperar(() => activados.length === 1, 10000, 'activar v1 al abrir');
  assert.deepEqual(activados[0], { version: v1.version, origen: 'red', fichas: v1.fichas.length });
  await sync.registrarSinRespuesta('¿hay restaurante en brisas?', 'brisas');
  ok(`al abrir: v${v1.version} descargada, verificada y activada sin interacción`);

  // --- se publica v2 → con el evento online la activa sola
  const v2 = structuredClone(v1);
  v2.version = subirUltimo(v1.version);
  v2.fichas.push({ ...v2.fichas.find((f) => f.estado === 'validado' && !f.bloqueada), id: 'ficha-nueva-v2' });
  const f2 = path.join(TMP, 'v2.json');
  fs.writeFileSync(f2, JSON.stringify(v2, null, 1), 'utf8');
  publicar(f2);
  recuperarSenal();
  await esperar(() => activados.length === 2, 10000, 'activar v2 con online');
  assert.equal(activados[1].version, v2.version);
  assert.ok((await sync.paqueteGuardado()).fichas.some((f) => f.id === 'ficha-nueva-v2'));
  assert.equal((await sync.estadoSync()).versionAnterior, v1.version);
  ok(`se publica v${v2.version} → evento online → activa sola (v${v1.version} queda como anterior)`);

  // --- sin urlSubida: el estático no recibe POST y la pregunta sigue en cola
  assert.deepEqual(posts, [], 'nunca se intenta POST al despliegue estático');
  assert.equal((await sync.colaSinRespuesta()).length, 1);
  ok('sin servidor de subida: cero POST y la pregunta sin respuesta sigue en cola en el teléfono');

  // --- firma alterada: rechazada, sigue v2
  const v3 = structuredClone(v2);
  v3.version = subirUltimo(v2.version);
  const f3 = path.join(TMP, 'v3.json');
  fs.writeFileSync(f3, JSON.stringify(v3, null, 1), 'utf8');
  publicar(f3);
  const fm = path.join(D.publicado, 'manifest.json');
  const m3 = JSON.parse(fs.readFileSync(fm, 'utf8'));
  fs.writeFileSync(fm, JSON.stringify({ ...m3, firma: (m3.firma[0] === 'A' ? 'B' : 'A') + m3.firma.slice(1) }), 'utf8');
  recuperarSenal();
  await esperar(async () => /firma/.test((await sync.estadoSync()).ultimoError || ''), 10000, 'rechazo de la firma');
  assert.equal(activados.length, 2);
  assert.equal((await sync.estadoSync()).versionActual, v2.version);
  ok(`manifest con firma alterada rechazado; sigue v${v2.version}`);

  // --- señal intermitente: la descarga de v3 falla 2 veces y, con backoff corto, termina activando sola
  fallarPaquete = 2;
  fs.writeFileSync(fm, JSON.stringify(m3, null, 2) + '\n', 'utf8');
  recuperarSenal();
  await esperar(() => activados.length === 3, 15000, 'activar v3 tras 2 fallos');
  assert.equal(fallosVistos, 2);
  assert.equal(activados[2].version, v3.version);
  assert.ok(sync.esperaTras(false) <= 60000, 'con versión obligatoria pendiente el reintento nunca pasa de 60 s');
  ok(`señal intermitente: 2 descargas fallidas de v${v3.version} y luego activada sola (backoff corto)`);

  // --- sin cambios: no vuelve a bajar nada
  const antes = activados.length;
  recuperarSenal();
  await esperar(async () => !(await sync.estadoSync()).ultimoError, 5000, 'revisión sin cambios');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(activados.length, antes);
  ok('revisión sin versión nueva: no descarga ni reactiva nada');

  // --- vigencia: cada descarga verificada renueva las 24 h (js/vigencia.js renovarCon, sin volver a descargar)
  let reloj = Date.parse('2026-11-26T08:00:00-05:00');
  vig.configurar({ ahora: () => reloj, mono: () => 0, ls: null });
  vig.activarSiPrimeraVez(24);
  reloj += 23 * 3600e3;
  const r = vig.renovarCon(await sync.paqueteGuardado());
  assert.equal(r.ok, true);
  assert.equal(r.venceEn, reloj + 24 * 3600e3);
  assert.equal(vig.renovarCon({ version: 'x' }).ok, false);
  ok('vigencia renovada 24 h desde la descarga (renovarCon); un paquete inválido no renueva');

  console.log(`\nPASA · ${pasos} comprobaciones`);
} catch (e) {
  console.error('\nFALLA:', e);
  process.exitCode = 1;
} finally {
  sync.detener();
  servidor.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}
