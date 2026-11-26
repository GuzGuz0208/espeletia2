// Abre una página en Chrome/Edge sin interfaz (protocolo DevTools, sin Playwright) y espera a que aparezca un texto en
// #salida. Solo usa 127.0.0.1. Uso:
//   node herramientas/navegador.mjs "http://127.0.0.1:8765/prueba-motor.html?auto=1" [segundos] [navegador.exe]
// Imprime el contenido de #salida (y los errores de consola). Sirve para medir tiempos del motor en el navegador real.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, seg = '300', exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe'] = process.argv.slice(2);
const puerto = 9300 + Math.floor(Math.random() * 500);
const perfil = mkdtempSync(join(tmpdir(), 'fray-nav-'));
const nav = spawn(exe, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 50 && !ws; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
    const p = l.find((x) => x.type === 'page');
    if (p) ws = new WebSocket(p.webSocketDebuggerUrl);
  } catch (e) { await dormir(200); }
}
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) console.error('[consola]', m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') console.error('[excepción]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const cdp = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await cdp('Runtime.enable');
await cdp('Page.enable');
const t0 = Date.now();
await cdp('Page.navigate', { url });
let salida = '';
while (Date.now() - t0 < Number(seg) * 1000) {
  await dormir(500);
  const r = await cdp('Runtime.evaluate', { expression: "(document.getElementById('salida')||{}).textContent||''", returnByValue: true });
  salida = r?.result?.value || '';
  if (salida) break;
}
console.log(salida || `(sin salida tras ${seg} s)`);
console.error(`reloj: ${Math.round((Date.now() - t0) / 1000)} s`);
ws.close(); nav.kill();
process.exit(0);
