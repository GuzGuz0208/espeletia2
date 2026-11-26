// Prueba de punta a punta de la sincronización (contrato §5 y §6).
// Uso: node pruebas/test_sync.mjs        (requiere python con `cryptography`; variable PYTHON para otro intérprete)
// Todo ocurre en una carpeta temporal y en 127.0.0.1: no toca contenido/clave_publica.json ni la clave real.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PY = process.env.PYTHON || 'python';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fray-sync-'));
const D = {
  claves: path.join(TMP, 'claves'), publica: path.join(TMP, 'clave_publica.json'),
  publicado: path.join(TMP, 'publicado'), datos: path.join(TMP, 'datos'),
};
const sync = await import(pathToFileURL(path.join(RAIZ, 'js', 'sync.js')).href);

let pasos = 0;
const ok = (msg) => console.log(`  ok ${++pasos} · ${msg}`);

function publicar(paquete, avisos, { esperaFallo = false } = {}) {
  const fa = path.join(TMP, `avisos-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(fa, JSON.stringify(avisos), 'utf8');
  const r = spawnSync(PY, ['-X', 'utf8', path.join(RAIZ, 'herramientas', 'firmar_paquete.py'),
    '--paquete', paquete, '--avisos', fa, '--salida', D.publicado, '--claves', D.claves, '--clave-publica', D.publica],
    { encoding: 'utf8', cwd: RAIZ });
  const salida = `${r.stdout}\n${r.stderr}`;
  if (esperaFallo) { assert.notEqual(r.status, 0, 'debía rechazarse'); return salida; }
  assert.equal(r.status, 0, salida);
  return salida;
}

function levantarServidor() {
  return new Promise((res, rej) => {
    const p = spawn(PY, ['-X', 'utf8', path.join(RAIZ, 'servidor', 'sync_base.py'), '--host', '127.0.0.1',
      '--puerto', '0', '--publicado', D.publicado, '--datos', D.datos], { cwd: RAIZ });
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d;
      const m = buf.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) res({ proceso: p, url: `http://127.0.0.1:${m[1]}` });
    });
    p.stderr.on('data', () => {});
    p.on('exit', (c) => rej(new Error(`el servidor terminó (${c})`)));
  });
}

const subirUltimo = (v) => v.replace(/(\d+)(?!.*\d)/, (n) => String(Number(n) + 1));
const hora = (h) => new Date(Date.now() + h * 3600e3).toISOString();

let servidor;
try {
  // --- v1 publicada con avisos (uno vigente, uno vencido, uno solo para Lunares)
  const v1 = JSON.parse(fs.readFileSync(path.join(RAIZ, 'contenido', 'paquete.json'), 'utf8'));
  const avisos = [
    { id: 'a1', texto: 'Hoy el recorrido sale de Brisas a las 8:30.', tipo: 'operativo', emitidoPor: 'Coordinación de guías, Brisas',
      vigenteDesde: hora(-1), vigenteHasta: hora(5), estaciones: null },
    { id: 'a2', texto: 'Ayer el sendero de Lunares cerró temprano.', tipo: 'operativo', emitidoPor: 'Coordinación de guías, Brisas',
      vigenteDesde: hora(-30), vigenteHasta: hora(-6), estaciones: null },
    { id: 'a3', texto: 'En Lunares la parada dura 10 minutos.', tipo: 'operativo', emitidoPor: 'Jefatura de operación',
      vigenteDesde: hora(-1), vigenteHasta: hora(5), estaciones: ['lunares'] },
  ];
  publicar(path.join(RAIZ, 'contenido', 'paquete.json'), avisos);
  const jwk = JSON.parse(fs.readFileSync(D.publica, 'utf8'));
  assert.ok(!('d' in jwk), 'la JWK publicada no puede traer la parte privada');
  ok(`v${v1.version} firmada y publicada; clave pública JWK sin parte privada`);

  // --- un aviso sobre el volcán o la salud no se firma
  const malo = publicar(path.join(RAIZ, 'contenido', 'paquete.json'), [{ ...avisos[0], id: 'x',
    texto: 'Alerta amarilla del volcán: no suban a Arenales.' }], { esperaFallo: true });
  assert.match(malo, /volc[aá]n|alerta/i);
  publicar(path.join(RAIZ, 'contenido', 'paquete.json'), [{ ...avisos[0], id: 'y',
    texto: 'Si alguien tiene síntomas de mal de altura, tomen agua.' }], { esperaFallo: true });
  ok('avisos sobre volcán, alerta o salud rechazados por firmar_paquete.py');

  servidor = await levantarServidor();
  const cargados = [];
  const avisosRecibidos = [];
  const opciones = {
    urlBase: servidor.url, urlSubida: servidor.url, clavePublicaJwk: jwk, almacen: sync.crearAlmacenMemoria(),
    primerIntentoMs: 3600e3, // en la prueba se llama a sincronizar() a mano
    alPaqueteNuevo: (p, info) => cargados.push(info.version), alAvisos: (a) => avisosRecibidos.push(a),
  };

  // --- sin base al alcance: la cola no se pierde
  sync.iniciarSync({ ...opciones, urlBase: 'http://127.0.0.1:9', urlSubida: 'http://127.0.0.1:9' });
  for (const [t, e] of [['¿Hay restaurante en Brisas?', 'brisas'], ['hay restaurante en brisas', 'brisas'],
    ['¿Por qué se llama Valle de las Tumbas? escríbeme a ana@correo.com o al 3001234567', 'tumbas']]) {
    await sync.registrarSinRespuesta(t, e);
  }
  const sinRed = await sync.sincronizar();
  assert.equal(sinRed.ok, false);
  assert.equal((await sync.colaSinRespuesta()).length, 3, 'la cola se conserva si la base no responde');
  const cola = await sync.colaSinRespuesta();
  assert.ok(!/ana@|3001234567/.test(cola[2].texto), 'correo y teléfono tapados');
  assert.match(cola[0].fecha, /^\d{4}-\d{2}-\d{2}$/);
  ok('sin conexión: 3 preguntas en cola, sin correo ni teléfono, fecha solo con el día');

  // --- primera sincronización: sube la cola y baja v1
  sync.iniciarSync({ ...opciones, almacen: undefined });
  const r1 = await sync.sincronizar();
  assert.equal(r1.ok, true, r1.error);
  assert.equal(r1.subidas, 3);
  assert.equal((await sync.colaSinRespuesta()).length, 0, 'la cola se vacía solo tras la confirmación');
  assert.equal(r1.paqueteNuevo, v1.version);
  assert.deepEqual(cargados, [v1.version]);
  ok(`cliente sincroniza: sube 3 preguntas y activa v${v1.version}`);

  // --- la bandeja agrupa por texto normalizado y estación
  const bandeja = await (await fetch(`${servidor.url}/bandeja`)).json();
  const g = bandeja.grupos;
  assert.equal(g.length, 2, JSON.stringify(g));
  assert.equal(g[0].conteo, 2);
  assert.equal(g[0].estacion, 'brisas');
  assert.equal(g[1].estacion, 'tumbas');
  // reenvío idempotente: los mismos ids no se duplican
  await fetch(`${servidor.url}/sin-respuesta`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dispositivo: 'abcdef12', preguntas: cola }) });
  const g2 = (await (await fetch(`${servidor.url}/bandeja`)).json()).grupos;
  assert.deepEqual(g2.map((x) => x.conteo), [2, 1]);
  ok('/bandeja: «hay restaurante en brisas» ×2 y la de Tumbas ×1; reenvío sin duplicados');

  // --- avisos: el vencido no se muestra; el de Lunares solo en Lunares
  const vig = await sync.avisosVigentes();
  assert.deepEqual(vig.map((a) => a.id).sort(), ['a1', 'a3']);
  assert.deepEqual((await sync.avisosVigentes({ estacion: 'brisas' })).map((a) => a.id), ['a1']);
  assert.deepEqual((await sync.avisosVigentes({ estacion: 'lunares' })).map((a) => a.id).sort(), ['a1', 'a3']);
  assert.equal(avisosRecibidos.length, 1);
  ok('aviso vencido oculto; aviso por estación filtrado');

  // --- sin cambios: no baja nada
  const r0 = await sync.sincronizar();
  assert.equal(r0.ok, true);
  assert.equal(r0.paqueteNuevo, null);
  assert.equal(r0.avisosNuevos, false);
  ok('segunda sincronización sin cambios: no descarga nada');

  // --- v2 con una ficha nueva
  const v2 = structuredClone(v1);
  v2.version = subirUltimo(v1.version);
  const fichaNueva = {
    id: 'tumbas-nombre-sync', estacion: 'tumbas', tema: 'cultura', tipo: 'ciencia', titulo: 'Por qué se llama Valle de las Tumbas',
    texto: 'El sitio conocido como el "Valle de las Tumbas" recibe su nombre por la presencia de rocas largas y planas (lajas) que se asemejan a ataúdes.',
    breve: 'El sitio conocido como el "Valle de las Tumbas" recibe su nombre por la presencia de rocas largas y planas (lajas) que se asemejan a ataúdes.',
    citas: [{ guion: 'UTON2024', pagina: 9 }],
    preguntas: ['¿por qué se llama Valle de las Tumbas?', '¿de dónde viene el nombre del valle?'],
    bloqueada: false, motivo: null, estado: 'validado',
  };
  v2.fichas.push(fichaNueva);
  const f2 = path.join(TMP, 'paquete_v2.json');
  fs.writeFileSync(f2, JSON.stringify(v2, null, 1), 'utf8');
  publicar(f2, avisos);
  const r2 = await sync.sincronizar();
  assert.equal(r2.ok, true, r2.error);
  assert.equal(r2.paqueteNuevo, v2.version);
  const activo = await sync.paqueteGuardado();
  assert.ok(activo.fichas.some((f) => f.id === 'tumbas-nombre-sync'));
  const est = await sync.estadoSync();
  assert.equal(est.versionActual, v2.version);
  assert.equal(est.versionAnterior, v1.version);
  assert.match(est.texto, /^Última sincronización: /);
  ok(`v${v2.version} con ficha nueva descargada, verificada y activa; v${v1.version} guardada como anterior («${est.texto}»)`);

  // --- firma alterada: se rechaza y sigue v2
  const v3 = structuredClone(v2);
  v3.version = subirUltimo(v2.version);
  const f3 = path.join(TMP, 'paquete_v3.json');
  fs.writeFileSync(f3, JSON.stringify(v3, null, 1), 'utf8');
  publicar(f3, avisos);
  const fm = path.join(D.publicado, 'manifest.json');
  const m3 = JSON.parse(fs.readFileSync(fm, 'utf8'));
  const alterado = { ...m3, firma: (m3.firma[0] === 'A' ? 'B' : 'A') + m3.firma.slice(1) };
  fs.writeFileSync(fm, JSON.stringify(alterado), 'utf8');
  const r3 = await sync.sincronizar();
  assert.equal(r3.ok, false);
  assert.match(r3.error, /firma/);
  assert.equal((await sync.estadoSync()).versionActual, v2.version);
  ok(`manifest con firma alterada rechazado («${r3.error}»); sigue v${v2.version}`);

  // --- versión cambiada en el manifest (sin re-firmar): rechazada
  fs.writeFileSync(fm, JSON.stringify({ ...m3, version: subirUltimo(v3.version) }), 'utf8');
  assert.equal((await sync.sincronizar()).ok, false);
  // --- paquete alterado con manifest válido: rechazado por sha256
  fs.writeFileSync(fm, JSON.stringify(m3), 'utf8');
  const fp = path.join(D.publicado, 'paquete.json');
  const original = fs.readFileSync(fp);
  fs.writeFileSync(fp, original.toString('utf8').replace('Valle de las Tumbas', 'Valle de las Tunbas'), 'utf8');
  const r4 = await sync.sincronizar();
  assert.equal(r4.ok, false);
  assert.match(r4.error, /sha256/);
  assert.equal((await sync.estadoSync()).versionActual, v2.version);
  fs.writeFileSync(fp, original);
  ok('manifest con versión cambiada y paquete alterado: rechazados');

  // --- volver atrás: v1 activa y v2 no se vuelve a bajar sola; v3 (más nueva) sí
  const va = await sync.volverAtras();
  assert.deepEqual(va, { ok: true, version: v1.version });
  ok(`volver atrás: activa v${v1.version}`);
  const r5 = await sync.sincronizar();
  assert.equal(r5.ok, true, r5.error);
  assert.equal(r5.paqueteNuevo, v3.version);

  // --- plan USB en otro dispositivo
  sync.iniciarSync({ clavePublicaJwk: jwk, almacen: sync.crearAlmacenMemoria() });
  const usb = fs.readFileSync(path.join(D.publicado, 'fray-paquete-usb.json'), 'utf8');
  const b = JSON.parse(usb);
  const malUsb = await sync.importarPaquete(JSON.stringify({ ...b, paquete: b.paquete.replace('lajas', 'losas') }));
  assert.equal(malUsb.ok, false);
  const bienUsb = await sync.importarPaquete(usb);
  assert.equal(bienUsb.ok, true, bienUsb.motivo);
  assert.equal(bienUsb.version, v3.version);
  assert.match((await sync.estadoSync()).texto, /\(USB\)$/);
  const exp = await sync.exportarCola();
  assert.equal(JSON.parse(exp.texto).formato, 'fray-sin-respuesta-1');
  assert.equal((await sync.sincronizar()).ok, false, 'sin urlBase no hay red');
  ok(`USB: paquete alterado rechazado; v${v3.version} importada con firma válida; sin urlBase no hace peticiones`);

  console.log(`\nPASA · ${pasos} comprobaciones`);
} catch (e) {
  console.error('\nFALLA:', e);
  process.exitCode = 1;
} finally {
  sync.detener();
  servidor?.proceso.kill();
  fs.rmSync(TMP, { recursive: true, force: true });
}
