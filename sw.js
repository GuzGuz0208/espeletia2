// Service worker: tras la primera carga, Fray funciona en modo avión.
// - APP: archivos de la interfaz (se guardan al instalar; si falta uno, la instalación falla).
// - OPCIONALES: motor, generador, paquete y modelo; se guardan si existen (aún pueden no estar en esta rama).
// - En ejecución: todo GET del mismo origen se guarda al pasar. models/ y lib/ van «primero caché» (archivos
//   grandes que no cambian); lo demás, «caché y actualizar en segundo plano».
// Nunca se toca otro origen (p. ej. el servidor local del modelo en 127.0.0.1:8080 no pasa por aquí).
// Vigencia (contrato §7): contenido/ y ejemplo/ (información del parque) NO se sirven desde caché si la vigencia venció
// (registro 'estado' en IndexedDB 'fray-vigencia', que escribe js/vigencia.js); van solo por red y no se guardan.
// Al cambiar archivos de la app, sube VERSION.
const VERSION = 'fray-v9-2026-11-26';
const CONTENIDO = /\/(contenido|ejemplo)\//;

const APP = [
  './', 'index.html', 'panel.html', 'styles.css', 'manifest.json',
  'js/ui.js', 'js/ui-motor.js', 'js/ui-paquete.js', 'js/ui-i18n.js', 'js/ui-art.js', 'js/cromos.js',
  // Álbum del Páramo (album.json es solo el catálogo, sin textos de los guiones: el dato va en contenido/, con vigencia)
  'album.css', 'album.json', 'js/album-app.js', 'js/album-estado.js', 'js/album-db.js', 'js/album-util.js', 'js/album-textos.js',
  'js/album-arte.js', 'js/album-cromo.js', 'js/album-sobre.js', 'js/album-vista.js', 'js/album-celebrar.js', 'js/album-pdf.js',
  'js/album-mapa.js', 'js/album-guia.js',
  'js/panel.js', 'js/panel-config.js', 'js/panel-pin.js', 'js/ui-sync.js', 'js/sync.js', 'js/vigencia.js', 'js/carril.js', 'js/qr-estacion.js', 'js/fray-mock.js', 'js/generador-mock.js',
  'lib/jsQR.js', 'lib/qrcode.js',
  'fonts/bricolage-grotesque-latin-wdth-normal.woff2', 'fonts/atkinson-hyperlegible-latin-400-normal.woff2', 'fonts/atkinson-hyperlegible-latin-700-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

const OPCIONALES = [
  'js/fray.js', 'js/fray-worker.js', 'js/nucleo.js', 'js/generador.js', 'js/verificador.js', 'js/conversacion.js', 'js/registro.js',
  'contenido/paquete.json', 'contenido/indice.json', 'contenido/clave_publica.json', 'contenido/qr_clave_demo.json', 'contenido/cromos.json',
  'models/fray-params.json', 'ejemplo/paquete-ejemplo.json',
  'lib/ort.wasm.min.js', 'lib/ort-wasm-simd-threaded.js', 'lib/ort-wasm-simd-threaded.wasm', 'lib/tokenizers.min.js',
  'models/e5_tokenizer.json', 'models/e5_tokenizer_config.json', 'models/partes.json',
];

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
self.addEventListener('message', (e) => {
  if (e.data?.tipo === 'vigencia') vigenciaMem = { venceEn: e.data.venceEn, vencido: !!e.data.vencido };
});

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
    const vencido = await contenidoVencido();
    await Promise.all(OPCIONALES.filter((u) => !(vencido && CONTENIDO.test('/' + u))).map((u) => guardarOpcional(cache, u)));
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
  // descargas/ (la APK de 18 MB) no se guarda en caché: va directo por red
  if (url.pathname.startsWith('/descargas/') || url.pathname.includes('/descargas/')) return;
  const fijo = /\/(models|lib|fonts)\//.test(url.pathname);
  if (CONTENIDO.test(url.pathname)) {
    e.respondWith((async () => {
      if (await contenidoVencido()) {
        // Vencido: solo red, sin guardar. Sin red no hay copia vieja (js/vigencia.js ya la borró del caché).
        try { return await fetch(e.request, { cache: 'no-store' }); } catch { return new Response('', { status: 503, statusText: 'contenido vencido' }); }
      }
      return responder(e, url, false);
    })());
    return;
  }
  e.respondWith(responder(e, url, fijo));
});

async function responder(e, url, fijo) {
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
}
