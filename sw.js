// Service worker del Álbum del Páramo con Fray: guarda toda la app para usarla en modo avión y avisa el progreso a la portada.
// (Base: sw.js del álbum original, rama r2/instalar; reglas de vigencia de Fray, contrato §7.)
//
// - APP: interfaz del álbum, motor de Fray (js/fray.js y su worker), Lente y mapa. Si falta uno, la instalación falla.
// - Archivos grandes (motor WASM, e5 para Fray, MobileNetV2 para la Lente, ~90 MB): partidos en trozos de 8 MB en
//   models/partes/ (models/partes.json). Se guardan las partes tal cual (los workers las unen y verifican la huella) y el
//   WASM entero (para compilarlo en streaming). Una parte que ya estaba en la caché anterior no se vuelve a bajar.
// - Contenido del parque (contenido/: paquete de fichas, cromos.json, clave): se guarda si existe, pero NO se sirve desde
//   la caché si la vigencia de 24 h venció (registro 'estado' en IndexedDB 'fray-vigencia', que escribe js/vigencia.js):
//   va solo por red y no se guarda. Nunca se guarda descargas/ (la APK).
// Nunca se toca otro origen (el servidor local del modelo en 127.0.0.1:8080 no pasa por aquí).
// Al cambiar archivos de la app, sube VERSION.
const VERSION = 'fray-album-v12-2026-11-26';
const CACHE = `album-paramo-${VERSION}`;
const CONTENIDO = /\/(contenido|ejemplo)\//;
const NUNCA = /\/(descargas|publicado)\//; // publicado/: actualizaciones firmadas, siempre por red (decisión 12)

const APP = [
  './', 'index.html', 'styles.css', 'manifest.json', 'paquete.json', 'panel.html', 'panel.css',
  'js/app.js', 'js/db.js', 'js/ml.js', 'js/util.js', 'js/estado.js', 'js/i18n.js', 'js/art.js', 'js/cromo.js',
  'js/album.js', 'js/sobre.js', 'js/chatui.js', 'js/fray-chat.js', 'js/celebrar.js', 'js/lente.js', 'js/mapa.js', 'js/portada.js',
  'js/ajustes.js', 'js/exportar.js', 'js/motor.js', 'js/motor-worker.js', 'js/guia.js', 'js/bitacora.js', 'js/sendero.js',
  'js/recorrido.js', 'js/relieve.js', 'js/mapa3d.js', 'js/sobre-demo.js', 'js/cromos-arte.js', 'css/cromos.css',
  // Fray: motor, carril de seguridad, IA local opcional, vigencia, sincronización, Panel y QR de estación
  'js/fray.js', 'js/fray-worker.js', 'js/nucleo.js', 'js/conversacion.js', 'js/registro.js', 'js/carril.js', 'js/generador.js', 'js/verificador.js', 'js/vigencia.js',
  'js/sync.js', 'js/ui-sync.js', 'js/actualizar.js', 'js/ui-paquete.js', 'js/ui-motor.js', 'js/qr-estacion.js', 'js/fray-mock.js', 'js/generador-mock.js',
  'js/panel.js', 'js/panel-config.js', 'js/panel-pin.js',
  'lib/ort.wasm.min.js', 'lib/ort-wasm-simd-threaded.js', 'lib/jsQR.js', 'lib/qrcode.js', 'lib/tokenizers.min.js',
  'fonts/bricolage-grotesque-latin-wdth-normal.woff2', 'fonts/atkinson-hyperlegible-latin-400-normal.woff2', 'fonts/atkinson-hyperlegible-latin-700-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'models/e5_tokenizer.json', 'models/e5_tokenizer_config.json', 'models/fray-params.json', 'models/partes.json', 'models/parque.json',
  'models/relieve.json', 'models/relieve.bin', 'models/relieve.webp',
  // Fotos reales de los cromos (Wikimedia Commons, créditos en img/cromos/creditos.json)
  'img/cromos/creditos.json', 'img/cromos/aguacerales-condensacion.jpg', 'img/cromos/aguacerales-frailejon.jpg', 'img/cromos/arenales-dunas.jpg', 'img/cromos/arenales-esqui.jpg', 'img/cromos/brisas-agua.jpg', 'img/cromos/condor.jpg', 'img/cromos/lunares-gelifraccion.jpg', 'img/cromos/lunares-loricaria.jpg', 'img/cromos/tumbas-kumanday.jpg', 'img/cromos/tumbas-nombre.jpg',
];
const WASM = 'lib/ort-wasm-simd-threaded.wasm';
// Contenido del parque: se guarda si la vigencia no venció
const CONTENIDO_APP = ['contenido/paquete.json', 'contenido/indice.json', 'contenido/cromos.json', 'contenido/clave_publica.json', 'contenido/qr_clave_demo.json'];

async function avisar(msg) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg);
}

// ---------- vigencia ----------
let vigenciaMem = null; // { venceEn, vencido } (lo actualiza también el mensaje de la página)
function leerVigencia() {
  return new Promise((ok) => {
    try {
      const r = indexedDB.open('fray-vigencia', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onerror = () => ok(vigenciaMem);
      r.onsuccess = () => {
        const d = r.result;
        try {
          const q = d.transaction('kv').objectStore('kv').get('estado');
          q.onsuccess = () => { d.close(); ok(q.result || vigenciaMem); };
          q.onerror = () => { d.close(); ok(vigenciaMem); };
        } catch { d.close(); ok(vigenciaMem); }
      };
    } catch { ok(vigenciaMem); }
  });
}
async function contenidoVencido() {
  const v = await leerVigencia();
  return !!(v && (v.vencido || (v.venceEn && Date.now() >= v.venceEn)));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => { try {
    const cache = await caches.open(CACHE);
    const man = await (await fetch('models/partes.json', { cache: 'no-cache' })).json();
    const grandes = Object.values(man);
    const partes = grandes.flatMap((m) => m.partes || []);
    const pesoParte = (p) => { const m = grandes.find((x) => x.partes?.includes(p)); return m ? m.bytes / 1e6 / m.partes.length : 1; };
    // Progreso por peso: los grandes cuentan según su tamaño en MB, los pequeños como 0,1 cada uno
    const pesoTotal = APP.length * 0.1 + 15 + partes.reduce((a, p) => a + pesoParte(p), 0);
    let hecho = 0;
    const avanzar = (x) => { hecho += x; avisar({ tipo: 'progreso', p: Math.min(1, hecho / pesoTotal) }); };
    for (const url of APP) {
      const res = await fetch(url, { cache: 'no-cache' }); // revalida: si no cambió, 304 sin descargar
      if (!res.ok) throw new Error(`No se pudo guardar ${url} (${res.status})`);
      await cache.put(url, res);
      avanzar(0.1);
    }
    // Partes y WASM: si ya están en una caché anterior (la huella va en el nombre de cada parte), se copian sin descargar
    for (const url of [WASM, ...partes]) {
      const previo = await caches.match(url);
      if (previo) await cache.put(url, previo);
      else {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`No se pudo guardar ${url} (${res.status})`);
        await cache.put(url, res);
      }
      avanzar(url === WASM ? 15 : pesoParte(url));
    }
    if (!(await contenidoVencido())) {
      for (const url of CONTENIDO_APP) {
        try { const r = await fetch(url, { cache: 'no-cache' }); if (r.ok) await cache.put(url, r); } catch { /* aún no existe */ }
      }
    }
    await self.skipWaiting();
  } catch (e) {
    avisar({ tipo: 'error', detalle: `${e.name}: ${e.message}` });
    throw e;
  } })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    avisar({ tipo: 'listo' });
  })());
});

// ---------- Al recuperar señal: verificar y reparar archivos grandes ----------
const sha256 = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((x) => x.toString(16).padStart(2, '0')).join('');
async function verificar() {
  const cache = await caches.open(CACHE);
  const manRes = await cache.match('models/partes.json');
  if (!manRes) return avisar({ tipo: 'verificado', malos: ['models/partes.json'] });
  const malos = [];
  for (const [ruta, m] of Object.entries(await manRes.json())) {
    const blobs = [];
    let falta = false;
    for (const p of m.partes) { const r = await cache.match(p); if (!r) { falta = true; break; } blobs.push(await r.blob()); }
    const b = new Blob(blobs);
    if (falta || b.size !== m.bytes || (await sha256(await b.arrayBuffer())) !== m.sha256) malos.push(ruta);
  }
  await avisar({ tipo: 'verificado', malos });
}
async function reparar(rutas = []) {
  const cache = await caches.open(CACHE);
  let man;
  try { man = await (await fetch('models/partes.json', { cache: 'no-cache' })).json(); } catch (e) {
    return avisar({ tipo: 'reparado', ok: [], fallidos: rutas.map((ruta) => ({ ruta, detalle: 'sin señal' })) });
  }
  const ok = [], fallidos = [];
  for (const ruta of rutas) {
    try {
      const lista = man[ruta] ? man[ruta].partes : APP.includes(ruta) || ruta === WASM ? [ruta] : null;
      if (!lista) throw new Error('no es un archivo de la app');
      for (const u of lista) { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error(String(r.status)); await cache.put(u, r); }
      ok.push(ruta);
    } catch (e) { fallidos.push({ ruta, detalle: e.message }); }
  }
  await avisar({ tipo: 'reparado', ok, fallidos });
}

self.addEventListener('message', (event) => {
  if (event.origin && event.origin !== location.origin) return;
  const d = event.data || {};
  if (d.tipo === 'vigencia') vigenciaMem = { venceEn: d.venceEn, vencido: !!d.vencido };
  if (d.tipo === 'verificar') event.waitUntil(verificar());
  if (d.tipo === 'reparar' && Array.isArray(d.rutas)) event.waitUntil(reparar(d.rutas.filter((r) => typeof r === 'string')));
});

// Primero la caché (funciona sin señal). paquete.json y parque.json del álbum se intentan actualizar con red y, si llegan
// distintos, se avisa a la página («contenido»). El contenido del parque respeta la vigencia.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || NUNCA.test(url.pathname)) return;
  if (CONTENIDO.test(url.pathname)) {
    event.respondWith((async () => {
      if (await contenidoVencido()) {
        // Vencido: solo red, sin guardar. Sin red no hay copia vieja (js/vigencia.js ya la borró del caché).
        try { return await fetch(req, { cache: 'no-store' }); } catch { return new Response('', { status: 503, statusText: 'contenido vencido' }); }
      }
      return responder(event, req, true);
    })());
    return;
  }
  event.respondWith(responder(event, req, /\/(paquete|parque)\.json$/.test(url.pathname)));
});

async function responder(event, req, revalidar) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit && !revalidar) return hit;
  try {
    const res = await fetch(req, revalidar ? { cache: 'no-cache' } : undefined);
    if (res.ok && hit && /\/(paquete|parque)\.json$/.test(new URL(req.url).pathname) && !CONTENIDO.test(new URL(req.url).pathname)) {
      const [antes, ahora] = await Promise.all([hit.clone().text(), res.clone().text()]);
      if (antes !== ahora) event.waitUntil(avisar({ tipo: 'contenido', archivo: new URL(req.url).pathname.split('/').pop() }));
    }
    if (res.ok && res.type === 'basic') event.waitUntil(cache.put(req, res.clone()));
    return res;
  } catch (e) {
    if (hit) return hit;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    throw e;
  }
}
