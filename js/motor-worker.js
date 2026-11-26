// Motor de IA en segundo plano (Web Worker): ONNX Runtime, los dos modelos y el tokenizador del chat.
// Todo lo pesado ocurre aquí, así la pantalla nunca se congela mientras carga o reconoce.
//
// De dónde salen los archivos grandes (motor WASM y modelos):
// - Si el service worker ya los guardó unidos (lo normal después de la primera visita), se piden por su
//   nombre normal, p. ej. lib/ort-wasm-simd-threaded.wasm: un solo archivo, ya verificado, y el motor WASM
//   se compila «en streaming», lo que deja a Chrome guardar el código compilado para la próxima vez.
// - Si no (primera visita, antes de que termine de guardarse), se descargan sus partes de 8 MB, se unen
//   y se verifica la huella SHA-256 (models/partes.json).
const R = (u) => new URL(u, import.meta.url).href;
const WASM = 'lib/ort-wasm-simd-threaded.wasm';
const MODELOS = {
  vision: 'models/mnv2_embed.onnx',
  texto: 'models/e5_small_latino.onnx',
};
let ortP = null, manP = null, tok = null;
let conSW = false; // ¿la página está controlada por el service worker? (si no, los archivos unidos no se sirven)
const sesiones = {}, cargas = {};

const manifiesto = () => (manP ??= fetch(R('../models/partes.json')).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));

// ¿El service worker ya tiene el archivo unido?
async function unido(ruta) {
  if (!conSW) return false;
  try { return !!(self.caches && (await caches.match(R('../' + ruta)))); } catch (e) { return false; }
}

async function traer(ruta) {
  let r;
  try { r = await fetch(R('../' + ruta)); } catch (e) { throw new Error(`no se pudo descargar ${ruta} (${e.message})`); }
  if (!r.ok) throw new Error(`${ruta} respondió ${r.status}: falta en el servidor`);
  return new Uint8Array(await r.arrayBuffer());
}

async function bytesDe(ruta, t) {
  const t0 = performance.now();
  if (await unido(ruta)) {
    try {
      const b = await traer(ruta);
      t.origen = 'guardado'; t.leer = Math.round(performance.now() - t0);
      return b;
    } catch (e) { /* si algo falla, se arma desde las partes */ }
  }
  const m = (await manifiesto())[ruta];
  if (!m) { const b = await traer(ruta); t.origen = 'red'; t.leer = Math.round(performance.now() - t0); return b; }
  const partes = await Promise.all(m.partes.map(traer));
  const out = new Uint8Array(m.bytes);
  let o = 0;
  for (const b of partes) { if (o + b.length > m.bytes) throw new Error(`${ruta}: una parte no coincide`); out.set(b, o); o += b.length; }
  if (o !== m.bytes) throw new Error(`${ruta} quedó incompleto (${o} de ${m.bytes} bytes)`);
  if (m.sha256 && crypto.subtle) {
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', out))].map((x) => x.toString(16).padStart(2, '0')).join('');
    if (h !== m.sha256) throw new Error(`${ruta} llegó dañado (la huella SHA-256 no coincide)`);
  }
  t.origen = 'partes'; t.leer = Math.round(performance.now() - t0);
  return out;
}

function cargarOrt(t) {
  ortP ??= (async () => {
    const t0 = performance.now();
    if (typeof WebAssembly !== 'object') throw new Error('este navegador no soporta WebAssembly');
    const ort = await import('../lib/ort.wasm.min.js');
    ort.env.wasm.numThreads = 1; // sin aislamiento entre orígenes: un hilo (este worker)
    ort.env.wasm.proxy = false;
    if (await unido(WASM)) ort.env.wasm.wasmPaths = { mjs: R('../lib/ort-wasm-simd-threaded.js'), wasm: R('../' + WASM) };
    else { ort.env.wasm.wasmPaths = { mjs: R('../lib/ort-wasm-simd-threaded.js') }; ort.env.wasm.wasmBinary = await bytesDe(WASM, {}); }
    t.motor = Math.round(performance.now() - t0);
    return ort;
  })();
  ortP.catch(() => (ortP = null));
  return ortP;
}

async function cargar(modelo) {
  if (sesiones[modelo]) return { ya: true };
  cargas[modelo] ??= (async () => {
    const t = {}; const t0 = performance.now();
    const ort = await cargarOrt(t);
    const pend = [bytesDe(MODELOS[modelo], t)];
    if (modelo === 'texto') pend.push((async () => {
      const t1 = performance.now();
      const { Tokenizer } = await import('../lib/tokenizers.min.js');
      const [tj, tc] = await Promise.all([fetch(R('../models/e5_tokenizer.json')).then((r) => r.json()), fetch(R('../models/e5_tokenizer_config.json')).then((r) => r.json())]);
      tok = new Tokenizer(tj, tc);
      t.tokenizador = Math.round(performance.now() - t1);
    })());
    const [bytes] = await Promise.all(pend);
    const t2 = performance.now();
    // Los modelos ya vienen optimizados desde el computador (herramientas/optimizar.py): no se repite aquí.
    sesiones[modelo] = { ort, s: await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'disabled' }) };
    t.sesion = Math.round(performance.now() - t2);
    t.total = Math.round(performance.now() - t0);
    return t;
  })();
  cargas[modelo].catch(() => delete cargas[modelo]);
  return cargas[modelo];
}

function normalizar(v) {
  let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const u = new Float32Array(v.length); for (let i = 0; i < v.length; i++) u[i] = v[i] / n;
  return u;
}

async function vision(datos) {
  const { ort, s } = sesiones.vision;
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', datos, [1, 3, 224, 224]) });
  return normalizar(out[s.outputNames[0]].data);
}

async function texto(txt) {
  const { ort, s } = sesiones.texto;
  const ids = tok.encode('query: ' + txt).ids.slice(0, 128);
  const L = ids.length;
  const T = (arr) => new ort.Tensor('int64', BigInt64Array.from(arr.map((x) => BigInt(x))), [1, L]);
  const out = await s.run({ input_ids: T(ids), attention_mask: T(new Array(L).fill(1)), token_type_ids: T(new Array(L).fill(0)) });
  const h = out.last_hidden_state.data, dim = 384, v = new Float32Array(dim);
  for (let p = 0; p < L; p++) for (let d = 0; d < dim; d++) v[d] += h[p * dim + d];
  for (let d = 0; d < dim; d++) v[d] /= L;
  return normalizar(v);
}

self.onmessage = async (e) => {
  const { id, tipo } = e.data;
  try {
    let res, transfer = [];
    if ('sw' in e.data) conSW = e.data.sw;
    if (tipo === 'cargar') res = await cargar(e.data.modelo);
    else if (tipo === 'vision') { await cargar('vision'); res = await vision(e.data.datos); transfer = [res.buffer]; }
    else if (tipo === 'texto') { await cargar('texto'); res = await texto(e.data.texto); transfer = [res.buffer]; }
    else throw new Error(`pedido desconocido: ${tipo}`);
    self.postMessage({ id, res }, transfer);
  } catch (err) {
    self.postMessage({ id, error: `${err?.name || 'Error'}: ${err?.message || err}` });
  }
};
