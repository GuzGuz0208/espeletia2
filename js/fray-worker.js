// Worker del motor de Fray: ONNX Runtime WASM + e5-small + índice del paquete + búsqueda. Nada de esto toca la red:
// todos los archivos son locales (lib/, models/). Si el modelo no carga, el motor sigue en modo solo léxico.
//
// cargar(paquete): construye el índice EN EL DISPOSITIVO (vectores «passage:» de cada ficha y de cada frase, «query:» de sus
// preguntas). Cada vector se guarda en IndexedDB por texto (y huella del modelo): si el personal edita fichas en el Panel,
// solo se recalcula lo que cambió, sin tocar código. contenido/indice.json (opcional, generado en el PC) siembra la caché.
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

// ---------- caché de vectores en IndexedDB (por texto) ----------
// Se guarda un vector por TEXTO (clave = huella del modelo + texto). Al editar una ficha en el Panel solo se recalculan los
// textos que cambiaron; el resto sale de la caché. Además, si existe contenido/indice.json (lo genera
// `python -X utf8 herramientas/fray_py.py --indice` con el mismo modelo), sus vectores siembran la caché: así el primer
// arranque en el dispositivo no tiene que recalcular todo.
function db() {
  return new Promise((si, no) => {
    const r = indexedDB.open('fray-vectores', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('v');
    r.onsuccess = () => si(r.result); r.onerror = () => no(r.error);
  });
}
async function leerVectores(claves) {
  try {
    const d = await db();
    return await new Promise((si) => {
      const st = d.transaction('v').objectStore('v'), out = new Array(claves.length).fill(null);
      let pend = claves.length;
      if (!pend) si(out);
      claves.forEach((k, i) => { const q = st.get(k); q.onsuccess = () => { out[i] = q.result || null; if (!--pend) si(out); }; q.onerror = () => { if (!--pend) si(out); }; });
    });
  } catch (e) { return claves.map(() => null); }
}
async function guardarVectores(pares) {
  if (!pares.length) return;
  try {
    const d = await db();
    await new Promise((si) => {
      const tx = d.transaction('v', 'readwrite'), st = tx.objectStore('v');
      for (const [k, v] of pares) st.put(v, k);
      tx.oncomplete = si; tx.onerror = si;
    });
  } catch (e) { /* sin IndexedDB: se recalcula la próxima vez */ }
}
function b64aF32(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Float32Array(u.buffer);
}
async function indicePrecalculado(ruta) {
  try {
    const j = await traer(ruta, 'json');
    if (j.modelo !== modeloSha || j.dim !== DIM) return new Map();
    const v = b64aF32(j.vectores), m = new Map();
    j.textos.forEach((t, i) => m.set(t, v.slice(i * DIM, (i + 1) * DIM)));
    return m;
  } catch (e) { return new Map(); }
}

// ---------- API del worker ----------
async function cargar(paquete, { params, indice = 'contenido/indice.json' } = {}, avisar) {
  const t0 = performance.now();
  try { const p = await traer('models/fray-params.json', 'json'); P = { ...PARAMS_DEFECTO, ...(p.params || p) }; } catch (e) { /* defectos */ }
  if (params) P = { ...P, ...params };
  idx = preparar(paquete);
  tiempos.prepararMs = Math.round(performance.now() - t0);
  modo = 'lexico';
  try {
    avisar?.({ fase: 'modelo' });
    await cargarModelo();
    const t1 = performance.now();
    const pref = `${ESQUEMA}|${modeloSha.slice(0, 16)}|`;
    const textos = idx.textos, n = textos.length;
    const vec = new Float32Array(n * DIM);
    const guardados = await leerVectores(textos.map((t) => pref + t));
    let faltan = [];
    guardados.forEach((v, i) => { if (v && v.length === DIM) vec.set(v, i * DIM); else faltan.push(i); });
    const deCache = n - faltan.length;
    let deIndice = 0;
    if (faltan.length && indice) {
      const pre = await indicePrecalculado(indice);
      const nuevos = [];
      faltan = faltan.filter((i) => { const v = pre.get(textos[i]); if (!v) return true; vec.set(v, i * DIM); nuevos.push([pref + textos[i], v]); return false; });
      deIndice = nuevos.length;
      await guardarVectores(nuevos);
    }
    if (faltan.length) {
      avisar?.({ fase: 'indice', hechos: 0, total: faltan.length });
      const nv = await embeber(faltan.map((i) => textos[i]), (h, t) => avisar?.({ fase: 'indice', hechos: h, total: t }));
      const pares = faltan.map((i, j) => { const v = nv.slice(j * DIM, (j + 1) * DIM); vec.set(v, i * DIM); return [pref + textos[i], v]; });
      await guardarVectores(pares);
    }
    idx.vec = vec; idx.dim = DIM;
    tiempos.indice = { ms: Math.round(performance.now() - t1), vectores: n, deCache, deIndice, calculados: faltan.length };
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

// Similitud e5 de cada texto («passage: …») contra cada frase de la ficha (para el chequeo de respaldo frase a frase del
// verificador del generador). En modo solo léxico devuelve sim = null.
async function similitud(textos, fichaId) {
  if (!idx) throw new Error('llama a cargar(paquete) antes');
  const fi = idx.fichas.findIndex((f) => f.id === fichaId);
  if (fi < 0) throw new Error(`ficha desconocida o bloqueada: ${fichaId}`);
  const frases = idx.fichas[fi]._frases;
  if (modo !== 'semantico') return { frases, sim: null, modo };
  const filas = idx.items.map((it, k) => [it, k]).filter(([it]) => it[0] === fi && it[1] === 's').map(([, k]) => k);
  const tv = await embeber(textos.map((t) => 'passage: ' + t));
  const sim = textos.map((_, a) => filas.map((k) => {
    let s = 0; for (let d = 0; d < DIM; d++) s += tv[a * DIM + d] * idx.vec[k * DIM + d];
    return s;
  }));
  return { frases, sim, modo };
}

export async function manejar(msg, avisar) {
  if (msg.tipo === 'cargar') return cargar(msg.paquete, msg.opciones || {}, avisar);
  if (msg.tipo === 'preguntar') return preguntar(msg.texto, msg.opciones || {});
  if (msg.tipo === 'embeber') { await cargarModelo(); return Array.from(await embeber(msg.textos)); }
  if (msg.tipo === 'similitud') return similitud(msg.textos, msg.fichaId);
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
