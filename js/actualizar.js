// js/actualizar.js · Actualizaciones obligatorias y automáticas del contenido y del código (contrato §5.8, decisión 12).
//
// Una sola llamada desde la interfaz:
//   import { iniciarActualizaciones } from './actualizar.js';
//   iniciarActualizaciones({ alPaqueteNuevo, alAvisos, cajaTexto: '#pregunta', versionLocal });
//
// Contenido: js/sync.js revisa `{origen}/publicado` (o la dirección guardada en el Panel) al abrir, con el evento `online`,
//   al volver a la app y cada 10 min mientras haya señal (timeout 8 s, backoff corto). Si el manifest firmado trae una versión
//   mayor, la baja, verifica firma y sha256 y la ACTIVA sin preguntar: renueva la vigencia de 24 h (vigencia.renovarCon),
//   llama a alPaqueteNuevo (la interfaz hace fray.cargar) y muestra «Contenido actualizado: versión …».
// Código: sw.js hace skipWaiting + clients.claim. Al llegar un service worker nuevo (`controllerchange`) la página se recarga
//   UNA vez, y solo cuando la caja de texto está vacía (si el visitante escribe, se espera). Con la app abierta se busca
//   código nuevo (reg.update) con señal, al volver a la app y cada 10 min.
// Sin señal no se intenta nada; responder nunca espera nada de aquí.

import { arrancarSync, sync } from './ui-sync.js';
import { renovarCon } from './vigencia.js';

const CADA_MS = 10 * 60000;

function textoPorDefecto(version) { return `Contenido actualizado: versión ${version}`; }

let avisoT = null;
function avisoBreve(texto) {
  if (typeof document === 'undefined') return;
  let a = document.getElementById('aviso-actualizado');
  if (!a) {
    a = document.createElement('p');
    a.id = 'aviso-actualizado';
    a.className = 'aviso-actualizado';
    a.setAttribute('role', 'status');
    // Estilo propio (no depende de la hoja de la interfaz): una píldora abajo, que no tapa la caja de texto
    a.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:1000;margin:0;' +
      'max-width:calc(100% - 32px);padding:10px 16px;border-radius:999px;background:#1f3d2b;color:#fff;' +
      'font:inherit;font-size:.95rem;box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none';
    document.body.append(a);
  }
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(avisoT);
  avisoT = setTimeout(() => { a.hidden = true; }, 6000);
}

function leerCaja(cajaTexto) {
  try {
    if (typeof cajaTexto === 'function') return String(cajaTexto() || '');
    const el = typeof cajaTexto === 'string' ? document.querySelector(cajaTexto) : cajaTexto;
    return String(el?.value || '');
  } catch { return ''; }
}

function vigilarCodigo(cajaTexto) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  const habiaControlador = !!sw.controller;   // en la primera instalación no hay nada que recargar
  let pendiente = false;
  const intentar = () => {
    if (!pendiente || leerCaja(cajaTexto).trim()) return;   // escribiendo: se espera a que la caja quede vacía
    try {
      const ultima = Number(sessionStorage.getItem('fray.recargaSW') || 0);
      if (Date.now() - ultima < 60000) { pendiente = false; return; }   // nunca en bucle
      sessionStorage.setItem('fray.recargaSW', String(Date.now()));
    } catch { /* sin sessionStorage: igual una sola vez (pendiente = false) */ }
    pendiente = false;
    location.reload();
  };
  sw.addEventListener('controllerchange', () => {
    if (!habiaControlador || pendiente) return;
    pendiente = true;
    intentar();
    const iv = setInterval(() => { if (!pendiente) clearInterval(iv); else intentar(); }, 2000);
  });
  sw.register('sw.js').then((reg) => {
    const buscar = () => { if (navigator.onLine !== false) reg.update().catch(() => {}); };
    addEventListener('online', buscar);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) buscar(); });
    setInterval(buscar, CADA_MS);
  }).catch((e) => console.warn('SW:', e));
}

/**
 * Arranca las actualizaciones automáticas. Devuelve la promesa de js/sync.js ({ sincronizar, detener, estado }).
 * opciones:
 *   alPaqueteNuevo(paquete, { version, origen })  la interfaz activa el paquete (fray.cargar). origen: 'red' | 'usb' | 'volver'
 *   alAvisos(avisosVigentes)                      repinta el banner de avisos
 *   cajaTexto                                     selector, elemento o función que da el texto que se está escribiendo
 *   versionLocal                                  versión del paquete que trae la app (no baja una igual o menor)
 *   textoActualizado(version)                     texto del aviso breve (por defecto en español)
 */
export function iniciarActualizaciones({ alPaqueteNuevo, alAvisos, cajaTexto = '#pregunta', versionLocal = null,
  textoActualizado = textoPorDefecto } = {}) {
  vigilarCodigo(cajaTexto);
  return arrancarSync({
    versionLocal,
    alAvisos,
    alPaqueteNuevo: async (paquete, info = {}) => {
      const descargado = info.origen === 'red' || info.origen === 'usb';
      // Descarga verificada = hubo señal: la vigencia de 24 h cuenta desde ahora (contrato §7)
      if (descargado) renovarCon(paquete);
      await alPaqueteNuevo?.(paquete, info);
      if (descargado) avisoBreve(textoActualizado(info.version ?? paquete.version));
    },
  });
}

export { sync };
