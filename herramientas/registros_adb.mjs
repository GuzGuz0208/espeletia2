// Junta el registro de la prueba (js/registro.js) desde el teléfono conectado por USB. Sin red: solo adb y 127.0.0.1.
//   node herramientas/registros_adb.mjs [--serial xw55eajnzhvw5xgm] [--paquete co.fray.paramo] [--probar "hola|¿qué es la gelifracción?|amplía"]
// (o herramientas/registros_adb.ps1 / registros_adb.sh, que llaman a este archivo)
// Fuentes (se unen y se quitan duplicados):
//  1. `adb logcat -d`: las líneas `FRAYLOG {json}` (el WebView manda console.* a logcat con la etiqueta chromium).
//  2. DevTools del WebView: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid> → Runtime.evaluate de
//     frayRegistro.leer() (IndexedDB 'fray-registro'). Sirve aunque logcat no tenga las líneas (o se haya rotado).
//  3. `adb pull` del último /sdcard/Download/fray-registro-*.json (el botón «Exportar registro de la prueba»).
// --probar: hace esas preguntas en la página del teléfono (fray.preguntar + generador.reescribir si la IA está lista) antes de
//   juntar; si la versión publicada aún no tiene js/registro.js, inyecta el de este repo para registrar.
// Salida: pruebas/registros/registro-<fecha>.json y registro-<fecha>.md (tabla pregunta → tipo → cita → IA → tiempos).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const SERIAL = arg('--serial', process.env.ANDROID_SERIAL || null);
const APP = arg('--paquete', 'co.fray.paramo');
const PUERTO = Number(arg('--puerto', 9222));
const PROBAR = arg('--probar');
const adb = (...a) => execFileSync('adb', [...(SERIAL ? ['-s', SERIAL] : []), ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const dos = (n) => String(n).padStart(2, '0');
const ahora = new Date();
const sello = `${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}`;
const SALIDA = join(RAIZ, 'pruebas', 'registros');
mkdirSync(SALIDA, { recursive: true });
const log = (...x) => console.error('[registros]', ...x);

// ---------- 1. logcat ----------
function deLogcat() {
  let txt = '';
  try { txt = adb('logcat', '-d', '-v', 'brief'); } catch (e) { log('logcat falló:', e.message); return []; }
  const out = [];
  for (const linea of txt.split(/\r?\n/)) {
    const i = linea.indexOf('FRAYLOG {');
    if (i < 0) continue;
    let s = linea.slice(i + 8);
    // chromium: [INFO:CONSOLE(12)] "FRAYLOG {...}", source: https://… (12)
    for (let k = s.lastIndexOf('}'); k > 0; k = s.lastIndexOf('}', k - 1)) {
      try { out.push(JSON.parse(s.slice(0, k + 1))); break; } catch { /* probar un } antes */ }
    }
  }
  log(`logcat: ${out.length} entradas FRAYLOG`);
  return out;
}

// ---------- 2. DevTools del WebView ----------
async function conDevtools(fn) {
  let pid = '';
  try { pid = adb('shell', 'pidof', APP).trim().split(/\s+/)[0]; } catch { /* no corre */ }
  if (!pid) { log(`${APP} no está corriendo: ábrela para leer IndexedDB`); return null; }
  adb('forward', `tcp:${PUERTO}`, `localabstract:webview_devtools_remote_${pid}`);
  try {
    const paginas = await (await fetch(`http://127.0.0.1:${PUERTO}/json`)).json();
    const p = paginas.find((x) => x.type === 'page' && /espeletia|fray|127\.0\.0\.1|localhost/.test(x.url)) || paginas.find((x) => x.type === 'page');
    if (!p) { log('DevTools: no hay página'); return null; }
    const ws = new WebSocket(p.webSocketDebuggerUrl);
    await new Promise((si, no) => { ws.onopen = si; ws.onerror = () => no(new Error('no se pudo abrir el WebSocket de DevTools')); });
    let n = 0; const pend = new Map();
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    const evaluar = (expression, ms = 60000) => new Promise((si, no) => {
      const id = ++n; const t = setTimeout(() => { pend.delete(id); no(new Error('DevTools: tiempo agotado')); }, ms);
      pend.set(id, (m) => { clearTimeout(t); if (m.result?.exceptionDetails) no(new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 400))); else si(m.result?.result?.value); });
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    try { return await fn(evaluar, p); } finally { ws.close(); }
  } catch (e) { log('DevTools falló:', e.message); return null; }
  finally { try { adb('forward', '--remove', `tcp:${PUERTO}`); } catch { /* nada */ } }
}

// Expresión que devuelve el módulo de registro de la página (o inyecta el del repo si la versión publicada no lo tiene)
const fuenteRegistro = readFileSync(join(RAIZ, 'js', 'registro.js'), 'utf8');
const MODULO_REGISTRO = `(async () => {
  try { const m = await import(new URL('js/registro.js', location.href).href); if (m.leerRegistro) return m; } catch (e) {}
  if (!globalThis.__frayRegistroInyectado) {
    const u = URL.createObjectURL(new Blob([${JSON.stringify(fuenteRegistro)}], { type: 'text/javascript' }));
    globalThis.__frayRegistroInyectado = await import(u);
  }
  return globalThis.__frayRegistroInyectado;
})()`;

async function probar(evaluar) {
  const preguntas = PROBAR.split('|').map((x) => x.trim()).filter(Boolean);
  const res = await evaluar(`(async () => {
    const reg = await ${MODULO_REGISTRO};
    const fray = await import(new URL('js/fray.js', location.href).href);
    let gen = null; try { gen = await import(new URL('js/generador.js', location.href).href); } catch (e) {}
    const ia = gen ? await gen.disponible().catch(() => ({ listo: false })) : { listo: false };
    const est = (document.querySelector('[data-estacion].activa, [aria-current="true"][data-estacion]') || {}).dataset?.estacion || null;
    const out = [];
    for (const p of ${JSON.stringify(preguntas)}) {
      const t0 = performance.now();
      const r = await fray.preguntar(p, { estacion: est });
      const ms = Math.round(performance.now() - t0);
      // Si la página publicada aún no registra sola, se registra aquí (misma forma que js/fray.js)
      if (!r.registro) { r.registro = 'p' + Date.now().toString(36); reg.registrar({ evento: 'pregunta', ref: r.registro, origen: 'probar', estacion: est, pregunta: p, tipo: r.tipo,
        categoria: r.categoria || null, intencion: r.intencion || null, fichas: r.fichas || [], citas: (r.citas || []).map((c) => c.guion + ' p. ' + c.pagina), breve: r.breve, modo: fray.estado()?.modo || null, ms }); }
      if (r.tipo === 'respuesta' && ia.listo) {
        const g = await gen.reescribir(r, p, { timeoutMs: 8000 });
        if (!g.registrado) reg.registrar({ evento: 'ia', ref: r.registro, origen: 'probar', pregunta: p, fichas: r.fichas || [], texto: g.texto, ok: g.ok, fallas: g.fallas, ms: g.ms, primeraMs: g.primeraMs ?? null, motor: g.motor || ia.motor });
      }
      out.push({ p, tipo: r.tipo, ms });
    }
    await new Promise((s) => setTimeout(s, 500));
    return { ia, out };
  })()`, 180000);
  log('probar:', JSON.stringify(res));
}

async function deIndexedDB() {
  const r = await conDevtools(async (evaluar, p) => {
    log(`DevTools: ${p.url}`);
    if (PROBAR) await probar(evaluar);
    return evaluar(`(async () => { const m = await ${MODULO_REGISTRO}; return await m.leerRegistro(); })()`);
  });
  log(`IndexedDB: ${r ? r.length : 0} entradas`);
  return r || [];
}

// ---------- 3. archivo exportado ----------
function deDescargas() {
  let lista = '';
  try { lista = adb('shell', 'ls -t /sdcard/Download/fray-registro-*.json 2>/dev/null').trim(); } catch { /* no hay */ }
  const ultimo = lista.split(/\r?\n/).map((x) => x.trim()).find((x) => x.endsWith('.json'));
  if (!ultimo) { log('Download: no hay fray-registro-*.json'); return []; }
  const local = join(SALIDA, ultimo.split('/').pop());
  try { adb('pull', ultimo, local); } catch (e) { log('adb pull falló:', e.message); return []; }
  try { const d = JSON.parse(readFileSync(local, 'utf8')); log(`Download: ${ultimo} (${(d.entradas || []).length} entradas)`); return d.entradas || []; }
  catch (e) { log('archivo exportado ilegible:', e.message); return []; }
}

// ---------- unir y resumir ----------
const idx = await deIndexedDB();
const lc = deLogcat();
const ex = deDescargas();
const vistos = new Set(); const entradas = [];
for (const e of [...idx, ...ex, ...lc]) {
  const k = [e.fecha, e.evento, e.ref, e.pregunta].join('|');
  if (vistos.has(k)) continue; vistos.add(k); entradas.push(e);
}
entradas.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
let modelo = '';
try { modelo = adb('shell', 'getprop', 'ro.product.model').trim(); } catch { /* nada */ }
const datos = { formato: 'fray-registro/1', juntado: ahora.toISOString(), telefono: modelo, app: APP,
  fuentes: { indexeddb: idx.length, logcat: lc.length, exportado: ex.length }, entradas };
const base = join(SALIDA, `registro-${sello}`);
writeFileSync(base + '.json', JSON.stringify(datos, null, 1));

const ia = new Map(entradas.filter((e) => e.evento === 'ia' && e.ref).map((e) => [e.ref, e]));
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const filas = entradas.filter((e) => e.evento === 'pregunta').map((e) => {
  const g = ia.get(e.ref);
  const iaTxt = g ? `${g.ok ? 'ok' : 'falla'}${g.fallas?.length ? ': ' + g.fallas.join('; ') : ''}` : '—';
  const t = `${e.ms ?? '—'} ms${g ? ` · IA ${g.primeraMs ?? '—'}/${g.ms ?? '—'} ms (${g.motor || '?'})` : ''}`;
  return `| ${esc(e.fecha).slice(11, 19)} | ${esc(e.estacion || '—')} | ${esc(e.pregunta)} | ${esc(e.tipo)}${e.intencion ? '/' + e.intencion : ''}${e.seguimiento ? '/' + e.seguimiento : ''}${e.categoria ? '/' + e.categoria : ''} | ${esc((e.citas || []).join(', ') || '—')} | ${esc(iaTxt).slice(0, 160)} | ${t} |`;
});
const tipos = {};
for (const e of entradas.filter((x) => x.evento === 'pregunta')) tipos[e.tipo] = (tipos[e.tipo] || 0) + 1;
const ias = [...ia.values()];
const md = [`# Registro de la prueba · ${modelo || 'teléfono'} · ${ahora.toISOString().slice(0, 16).replace('T', ' ')}`, '',
  `Fuentes: IndexedDB ${idx.length} · logcat ${lc.length} · exportado ${ex.length} → ${entradas.length} entradas únicas ` +
  `(paquete ${[...new Set(entradas.map((e) => e.paquete).filter(Boolean))].join(', ') || '—'}; dispositivos ${new Set(entradas.map((e) => e.dispositivo)).size}).`, '',
  `Tipos: ${Object.entries(tipos).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'} · IA: ${ias.filter((g) => g.ok).length}/${ias.length} pasan el verificador.`, '',
  '| Hora (UTC) | Estación | Pregunta | Tipo | Cita | IA (verificador) | Tiempos (motor · IA 1.ª palabra/total) |', '|---|---|---|---|---|---|---|', ...filas, ''].join('\n');
writeFileSync(base + '.md', md);
console.log(md);
log(`escrito ${base}.json y .md`);
