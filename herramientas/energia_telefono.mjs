// Mide en el teléfono (APK Fray abierta, desbloqueada, por USB) el costo de responder N preguntas con la IA local:
// tiempos, tokens, temperatura de batería y energía estimada por Android (batterystats) para la app.
//   node herramientas/energia_telefono.mjs <serial> [salida.json]
// Cómo: batterystats --reset + «battery unplug» (Android deja de ver el cable y contabiliza el consumo; la carga real por USB
// sigue, por eso se usa la ESTIMACIÓN por app de batterystats —CPU, pantalla— y no el % de batería). Al final: «battery reset».
// Es una estimación del modelo de potencia del fabricante, no una medición con amperímetro: se reporta así.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SERIAL = process.argv[2];
const SALIDA = process.argv[3] || `pruebas/resultados/energia-telefono-${new Date().toISOString().slice(0, 10)}.json`;
const APP = 'co.fray.paramo', PUERTO = 9335;
const PREGUNTAS = [
  '¿Por qué dicen que el páramo es una fábrica de agua?', '¿Qué papel cumple el frailejón en este lugar?',
  '¿Por qué debemos evitar pisar las dunas?', '¿Por qué se fracturan las rocas en Lunares?', '¿Y por qué algunas rocas son rojizas?',
  '¿Por qué se llama Valle de las Tumbas?', '¿Las rocas gigantes de Arenales las arrojó el volcán?', '¿Qué es la necromasa del frailejón?',
  '¿Qué animales viven en el páramo?', '¿Qué es un glaciar?', '¿Hay restaurante en Brisas?', '¿Cuál es la alerta del volcán hoy?',
  '¿Qué significa Kumanday?', 'porqe se rompen las piedras en lunares', '¿Cómo se formaron las lagunas?', '¿Qué es el pajonal?',
  '¿Por qué el agua del páramo es importante?', '¿Qué es la gelifracción?', '¿Qué altura tiene el nevado del Ruiz?', '¿Qué es un lahar?',
];
if (!SERIAL) { console.error('uso: node herramientas/energia_telefono.mjs <serial> [salida.json]'); process.exit(1); }
const adb = (...a) => execFileSync('adb', ['-s', SERIAL, ...a], { encoding: 'utf8' });
const temp = () => Number(/temperature: (\d+)/.exec(adb('shell', 'dumpsys', 'battery'))?.[1]) / 10;

const pid = adb('shell', 'pidof', APP).trim().split(/\s+/)[0];
if (!pid) { console.error('Abre la app Fray en el teléfono y vuelve a correr.'); process.exit(1); }
const uid = /uid:(\d+)/.exec(adb('shell', 'pm', 'list', 'packages', '-U', APP))?.[1];
adb('forward', `tcp:${PUERTO}`, `localabstract:webview_devtools_remote_${pid}`);
const paginas = await (await fetch(`http://127.0.0.1:${PUERTO}/json`)).json();
const p = paginas.find((x) => x.type === 'page' && x.url.startsWith('https://'));
const ws = new WebSocket(p.webSocketDebuggerUrl);
await new Promise((ok) => { ws.onopen = ok; });
const evaluar = (expression) => new Promise((ok) => {
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) ok(d.result?.result?.value); };
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});

adb('shell', 'dumpsys', 'batterystats', '--reset');
adb('shell', 'dumpsys', 'battery', 'unplug');
const t0 = Date.now(), temp0 = temp();
let res;
try {
  res = await evaluar(`(async () => {
    const f = await import('/js/fray-chat.js'); await f.cargar();
    const out = [];
    for (const q of ${JSON.stringify(PREGUNTAS)}) {
      const a = performance.now(); const r = await f.preguntar(q); const m = performance.now() - a;
      let ia = null, iaMs = 0;
      if (r.tipo === 'respuesta') { const b = performance.now(); ia = await f.reescribir(r, q, { timeoutMs: 8000 }); iaMs = performance.now() - b; }
      out.push({ q, tipo: r.tipo, motorMs: Math.round(m), iaMs: Math.round(iaMs), iaOk: !!ia, totalMs: Math.round(m + iaMs) });
    }
    return out;
  })()`);
} finally {
  var segundos = (Date.now() - t0) / 1000, temp1 = temp();
  var stats = adb('shell', 'dumpsys', 'batterystats', '--charged', APP);
  adb('shell', 'dumpsys', 'battery', 'reset');
  ws.close();
  adb('forward', '--remove', `tcp:${PUERTO}`);
}
// «UID u0a390: 12.3 ( cpu=… )» en «Estimated power use (mAh)»
const uidTxt = uid ? `u0a${Number(uid) - 10000}` : null;
const linea = stats.split('\n').find((l) => uidTxt && l.includes(`UID ${uidTxt}:`)) || '';
const mAh = Number(/:\s*([\d.]+)/.exec(linea)?.[1]) || null;
const capacidad = Number(/Estimated battery capacity: (\d+)/.exec(stats)?.[1]) || null;
const telefono_mAh = Number(/\n\s*Discharge: ([\d.]+) mAh/.exec(stats)?.[1]) || null; // todo el teléfono (pantalla incluida)
const ia = res.filter((x) => x.tipo === 'respuesta');
const resumen = {
  fecha: new Date().toISOString(), dispositivo: adb('shell', 'getprop', 'ro.product.model').trim(), preguntas: res.length,
  segundos: Math.round(segundos), temperatura: { inicio: temp0, fin: temp1 },
  energiaEstimadaApp_mAh: mAh, mAhPorPregunta: mAh ? +(mAh / res.length).toFixed(3) : null,
  descargaTelefono_mAh: telefono_mAh, capacidadBateria_mAh: capacidad, preguntasPorBateria: mAh && capacidad ? Math.round(capacidad / (mAh / res.length)) : null,
  conIA: ia.length, iaVerificada: ia.filter((x) => x.iaOk).length,
  totalMsMediana: [...res.map((x) => x.totalMs)].sort((a, b) => a - b)[Math.floor(res.length / 2)],
  nota: 'Energía = estimación de Android (batterystats, modelo de potencia del fabricante) para la app, con el cable «desconectado» por software. No es una medición con amperímetro.',
  lineaBatterystats: linea.trim(), detalle: res,
};
writeFileSync(SALIDA, JSON.stringify(resumen, null, 1) + '\n');
console.log(JSON.stringify({ ...resumen, detalle: undefined }, null, 1));
