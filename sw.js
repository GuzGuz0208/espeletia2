// Service worker: tras la primera carga, Fray funciona en modo avión.
// - APP: archivos de la interfaz (se guardan al instalar; si falta uno, la instalación falla).
// - OPCIONALES: motor, generador, paquete y modelo; se guardan si existen (aún pueden no estar en esta rama).
// - En ejecución: todo GET del mismo origen se guarda al pasar. models/ y lib/ van «primero caché» (archivos
//   grandes que no cambian); lo demás, «caché y actualizar en segundo plano».
// Nunca se toca otro origen (p. ej. el servidor local del modelo en 127.0.0.1:8080 no pasa por aquí).
// Al cambiar archivos de la app, sube VERSION.
const VERSION = 'fray-v2-2026-11-26';

const APP = [
  './', 'index.html', 'panel.html', 'styles.css', 'manifest.json',
  'js/ui.js', 'js/ui-motor.js', 'js/ui-paquete.js', 'js/ui-i18n.js', 'js/ui-art.js',
  'js/panel.js', 'js/panel-config.js', 'js/panel-pin.js', 'js/qr-estacion.js', 'js/fray-mock.js', 'js/generador-mock.js',
  'lib/jsQR.js', 'lib/qrcode.js',
  'fonts/bricolage-grotesque-latin-wdth-normal.woff2', 'fonts/atkinson-hyperlegible-latin-400-normal.woff2', 'fonts/atkinson-hyperlegible-latin-700-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'ejemplo/paquete-ejemplo.json',
];

const OPCIONALES = [
  'js/fray.js', 'js/fray-worker.js', 'js/nucleo.js', 'js/carril.js', 'js/generador.js', 'contenido/paquete.json', 'models/fray-params.json',
  'lib/ort.wasm.min.js', 'lib/ort-wasm-simd-threaded.js', 'lib/ort-wasm-simd-threaded.wasm', 'lib/tokenizers.min.js',
  'models/e5_tokenizer.json', 'models/e5_tokenizer_config.json', 'models/partes.json',
];

async function guardarOpcional(cache, url) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (r.ok) await cache.put(url, r);
  } catch { /* no existe todavía: se guardará cuando se use */ }
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(APP);
    await Promise.all(OPCIONALES.map((u) => guardarOpcional(cache, u)));
    // Partes del modelo listadas en models/partes.json (si el motor las trae)
    try {
      const m = await (await cache.match('models/partes.json'))?.json();
      const partes = Object.values(m?.archivos || m || {}).flatMap((x) => x?.partes || []);
      for (const p of partes) await guardarOpcional(cache, p);
    } catch { /* sin modelo: el motor de ejemplo no lo necesita */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const fijo = /\/(models|lib|fonts)\//.test(url.pathname);
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const guardada = await cache.match(e.request, { ignoreSearch: true });
    const red = fetch(e.request).then((r) => {
      if (r.ok && r.type === 'basic') cache.put(e.request, r.clone());
      return r;
    });
    if (guardada) {
      if (!fijo) e.waitUntil(red.catch(() => {}));
      return guardada;
    }
    try { return await red; } catch {
      if (e.request.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
