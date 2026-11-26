// GENERADOR DE EJEMPLO (mock) con la API de js/generador.js (docs/contrato.md §3).
// Por defecto dice «no disponible», como un dispositivo sin modelo local.
// Para ver en la demo cómo se ve la marca «redactado por IA local · verificado», abre la app con ?ia=demo.
// No usa red ni modelo: solo devuelve el mismo texto del guion tras una pausa.

export const esEjemplo = true;

export async function disponible() {
  const demo = new URLSearchParams(location.search).get('ia') === 'demo';
  return { listo: demo, modelo: demo ? 'ejemplo' : null, motor: 'mock' };
}

export async function reescribir(r, pregunta, { timeoutMs = 6000 } = {}) {
  const t0 = performance.now();
  await new Promise((ok) => setTimeout(ok, Math.min(1200, timeoutMs)));
  return { texto: r.breve, ok: true, fallas: [], ms: Math.round(performance.now() - t0) };
}
