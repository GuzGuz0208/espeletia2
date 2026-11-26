// Worker del motor de Fray: ONNX Runtime WASM + e5-small + índice del paquete + búsqueda. Nada de esto toca la red:
// todos los archivos son locales (lib/, models/). Si el modelo no carga, el motor sigue en modo solo léxico.
//
// cargar(paquete): construye el índice EN EL DISPOSITIVO (vectores «passage:» de cada ficha y de cada frase, «query:» de sus
// preguntas) y lo guarda en IndexedDB con una clave = versión del paquete + huella SHA-256 de su contenido + huella del modelo.
// Así el personal edita fichas en el Panel y el índice se recalcula solo, sin tocar código.
import { preparar, decidir, PARAMS_DEFECTO, ESQUEMA } from './nucleo.js';

const R = (u) => new URL(u, import.meta.url).href;
const MODELO = 'models/e5_small_latino.onnx';
const LOTE = 1, MAXTOK = 128, DIM = 384, PAD = 1;

let ort = null, ses = null, tok = null, modeloSha = null, cargaModelo = null;
let idx = null, P = { ...PARAMS_DEFECTO }, modo = 'sin-cargar';
const tiempos = {};

// ---------- archivos locales ----------
async function traer(ruta, tipo = 'bytes') {
  const r = await fetch(R('../' + ruta));
  if (!r.ok) throw new Error(`${ruta} respondió ${r.status}`);
  return tipo === 'json' ? r.json() : new Uint8Array(await r.arrayBuffer());
}
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function sha256(datos) { return hex(await crypto.subtle.digest('SHA-256', datos)); }

async function bytesModelo() {
  const man = (await traer('models/partes.json', 'json'))[MODELO];
  const partes = await Promise.all(man.partes.map((p) => traer(p)));
  const out = new Uint8Array(man.bytes);
  let o = 0;
  for (const b of partes) { out.set(b, o); o += b.length; }
  if (o !== man.bytes) throw new Error(`${MODELO} incompleto (${o} de ${man.bytes} bytes)`);
  if (crypto.subtle && (await sha256(out)) !== man.sha256) throw new Error(`${MODELO} dañado (SHA-256 no coincide)`);
  modeloSha = man.sha256;
  return out;
}

function cargarModelo() {
  cargaModelo ??= (async () => {
    const t0 = performance.now();
    if (typeof WebAssembly !== 'object') throw new Error('sin WebAssembly');
    ort = await import('../lib/ort.wasm.min.js');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = { mjs: R('../lib/ort-wasm-simd-threaded.js'), wasm: R('../lib/ort-wasm-simd-threaded.wasm') };
    const [bytes] = await Promise.all([
      bytesModelo(),
      (async () => {
        const { Tokenizer } = await import('../lib/tokenizers.min.js');
        const [tj, tc] = await Promise.all([traer('models/e5_tokenizer.json', 'json'), traer('models/e5_tokenizer_config.json', 'json')]);
        tok = new Tokenizer(tj, tc);
      })(),
    ]);
    ses = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'disabled' });
    tiempos.modeloMs = Math.round(performance.now() - t0);
  })();
  cargaModelo.catch(() => { cargaModelo = null; });
  return cargaModelo;
}

// ---------- vectores e5 (promedio con máscara, normalizado) ----------
function ids(texto) {
  let v = tok.encode(texto).ids;
  if (v.length > MAXTOK) v = v.slice(0, MAXTOK - 1).concat(v[v.length - 1]); // como truncation=128 en Python: conserva </s>
  return v;
}
async function embeber(textos, alAvance) {
  const n = textos.length, out = new Float32Array(n * DIM);
  const tk = textos.map(ids);
  const orden = [...tk.keys()].sort((a, b) => tk[a].length - tk[b].length); // lotes de largo parecido = menos relleno
  for (let i = 0; i < n; i += LOTE) {
    const sel = orden.slice(i, i + LOTE), B = sel.length, L = Math.max(...sel.map((k) => tk[k].length));
    const ii = new BigInt64Array(B * L).fill(BigInt(PAD)), mm = new BigInt64Array(B * L), tt = new BigInt64Array(B * L);
    sel.forEach((k, b) => tk[k].forEach((x, p) => { ii[b * L + p] = BigInt(x); mm[b * L + p] = 1n; }));
    const T = (a) => new ort.Tensor('int64', a, [B, L]);
    const res = await ses.run({ input_ids: T(ii), attention_mask: T(mm), token_type_ids: T(tt) });
    const h = res.last_hidden_state.data;
    sel.forEach((k, b) => {
      const len = tk[k].length, v = new Float64Array(DIM);
      for (let p = 0; p < len; p++) { const o = (b * L + p) * DIM; for (let d = 0; d < DIM; d++) v[d] += h[o + d]; }
      let s = 0; for (let d = 0; d < DIM; d++) { v[d] /= len; s += v[d] * v[d]; }
      s = Math.sqrt(s) || 1;
      for (let d = 0; d < DIM; d++) out[k * DIM + d] = v[d] / s;
    });
    alAvance?.(Math.min(n, i + LOTE), n);
  }
  return out;
}

// ---------- caché en IndexedDB ----------
function db() {
  return new Promise((si, no) => {
    const r = indexedDB.open('fray-indice', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('indices');
    r.onsuccess = () => si(r.result); r.onerror = () => no(r.error);
  });
}
async function leerCache(clave) {
  try {
    const d = await db();
    return await new Promise((si) => { const q = d.transaction('indices').objectStore('indices').get(clave); q.onsuccess = () => si(q.result || null); q.onerror = () => si(null); });
  } catch (e) { return null; }
}
async function guardarCache(clave, valor) {
  try {
    const d = await db();
    await new Promise((si) => {
      const tx = d.transaction('indices', 'readwrite'), st = tx.objectStore('indices');
      st.clear(); st.put(valor, clave); // solo se guarda el índice vigente
      tx.oncomplete = si; tx.onerror = si;
    });
  } catch (e) { /* sin IndexedDB: se recalcula la próxima vez */ }
}

// ---------- API del worker ----------
async function cargar(paquete, { params } = {}, avisar) {
  const t0 = performance.now();
  try { const p = await traer('models/fray-params.json', 'json'); P = { ...PARAMS_DEFECTO, ...(p.params || p) }; } catch (e) { /* defectos */ }
  if (params) P = { ...P, ...params };
  idx = preparar(paquete);
  tiempos.prepararMs = Math.round(performance.now() - t0);
  modo = 'lexico';
  try {
    avisar?.({ fase: 'modelo' });
    await cargarModelo();
    const huella = await sha256(new TextEncoder().encode(JSON.stringify([paquete.fichas, paquete.conflictos])));
    const clave = `${ESQUEMA}|${paquete.version || ''}|${huella}|${modeloSha}`;
    const t1 = performance.now();
    const c = await leerCache(clave);
    if (c && c.n === idx.textos.length) {
      idx.vec = c.vec; idx.dim = DIM; tiempos.indice = { ms: Math.round(performance.now() - t1), cache: true, vectores: c.n };
    } else {
      avisar?.({ fase: 'indice', hechos: 0, total: idx.textos.length });
      idx.vec = await embeber(idx.textos, (h, t) => avisar?.({ fase: 'indice', hechos: h, total: t }));
      idx.dim = DIM;
      tiempos.indice = { ms: Math.round(performance.now() - t1), cache: false, vectores: idx.textos.length };
      await guardarCache(clave, { n: idx.textos.length, vec: idx.vec, version: paquete.version, fecha: new Date().toISOString() });
    }
    modo = 'semantico';
  } catch (e) {
    tiempos.errorModelo = String(e?.message || e);
    idx.vec = null; modo = 'lexico';
  }
  tiempos.cargarMs = Math.round(performance.now() - t0);
  return { modo, fichas: idx.fichas.length, vectores: idx.vec ? idx.textos.length : 0, tiempos: { ...tiempos }, params: P };
}

async function preguntar(texto, opciones = {}) {
  if (!idx) throw new Error('llama a cargar(paquete) antes de preguntar');
  const t0 = performance.now();
  const qv = modo === 'semantico' ? (await embeber(['query: ' + texto])) : null;
  const r = decidir(idx, qv, texto, opciones, P);
  r.ms = Math.round(performance.now() - t0);
  return r;
}

export async function manejar(msg, avisar) {
  if (msg.tipo === 'cargar') return cargar(msg.paquete, msg.opciones || {}, avisar);
  if (msg.tipo === 'preguntar') return preguntar(msg.texto, msg.opciones || {});
  if (msg.tipo === 'embeber') { await cargarModelo(); return Array.from(await embeber(msg.textos)); }
  if (msg.tipo === 'estado') return { modo, tiempos: { ...tiempos }, params: P };
  throw new Error(`pedido desconocido: ${msg.tipo}`);
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = async (e) => {
    const { id } = e.data;
    try {
      const res = await manejar(e.data, (aviso) => self.postMessage({ id, aviso }));
      self.postMessage({ id, res });
    } catch (err) {
      self.postMessage({ id, error: `${err?.name || 'Error'}: ${err?.message || err}` });
    }
  };
}
