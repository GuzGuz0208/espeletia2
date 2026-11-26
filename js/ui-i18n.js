// Textos de la interfaz (no del parque: el contenido sale del paquete). Español por defecto; inglés opcional.
// Para añadir un texto: ponlo en `es` y, si quieres, en `en`. Si falta en inglés, se muestra en español.

const textos = {
  es: {
    'app.titulo': 'Fray, tu guía del páramo',
    'app.sub': 'Pregúntame sobre lo que ves. Respondo con los guiones oficiales del parque y te digo de qué página sale.',
    'inicio.elige': 'Elige tu estación',
    'inicio.qr': 'Escanear el QR de la estación',
    'inicio.introduccion': 'Introducción',
    'inicio.guia': 'Tu guía va contigo: yo lo complemento, no lo reemplazo.',
    'estado.preparando': 'Fray está preparando sus guiones…',
    'estado.ejemplo': 'Motor de ejemplo',
    'estado.paqueteEjemplo': 'Paquete de ejemplo',
    'qr.titulo': 'Apunta la cámara al código QR de la estación',
    'qr.cancelar': 'Cancelar',
    'qr.ajeno': 'Este código no es del parque.',
    'qr.sinCamara': 'No pude abrir la cámara. Elige la estación en la lista.',
    'chat.volver': 'Estaciones',
    'chat.hola': 'Estás en {estacion}. ¿Qué quieres saber?',
    'chat.sugerencias': 'Puedes preguntarme',
    'chat.placeholder': 'Escribe tu pregunta…',
    'chat.preguntar': 'Preguntar',
    'chat.pensando': 'Buscando en los guiones…',
    'chat.ampliar': 'Ampliar',
    'chat.menos': 'Ver menos',
    'chat.escuchar': 'Escuchar',
    'chat.callar': 'Detener',
    'chat.relato': 'Relato de tradición oral',
    'chat.difieren': 'Los guiones difieren',
    'chat.seguridad': 'Avisa a tu guía o al personal del parque',
    'chat.abstencion': 'Tu pregunta queda anotada para que el personal del parque pueda agregar la respuesta.',
    'chat.duda': '¿Te refieres a…?',
    'chat.ia': 'redactado por IA local · verificado',
    'chat.error': 'Algo falló al buscar. Pregúntale a tu guía.',
    'ajustes.titulo': 'Ajustes',
    'ajustes.letra': 'Tamaño de letra',
    'ajustes.contraste': 'Alto contraste',
    'ajustes.idioma': 'Idioma',
    'ajustes.cerrar': 'Listo',
    'pie.panel': 'Panel del parque',
  },
  en: {
    'app.titulo': 'Fray, your páramo guide',
    'app.sub': 'Ask me about what you see. I answer from the park’s official scripts (in Spanish) and tell you the page.',
    'inicio.elige': 'Choose your station',
    'inicio.qr': 'Scan the station QR code',
    'inicio.introduccion': 'Introduction',
    'inicio.guia': 'Your guide comes with you: I add to them, I don’t replace them.',
    'estado.preparando': 'Fray is getting the scripts ready…',
    'estado.ejemplo': 'Example engine',
    'estado.paqueteEjemplo': 'Example package',
    'qr.titulo': 'Point the camera at the station QR code',
    'qr.cancelar': 'Cancel',
    'qr.ajeno': 'This code is not from the park.',
    'qr.sinCamara': 'I couldn’t open the camera. Pick the station from the list.',
    'chat.volver': 'Stations',
    'chat.hola': 'You are at {estacion}. What would you like to know?',
    'chat.sugerencias': 'You can ask me',
    'chat.placeholder': 'Type your question…',
    'chat.preguntar': 'Ask',
    'chat.pensando': 'Searching the scripts…',
    'chat.ampliar': 'More',
    'chat.menos': 'Less',
    'chat.escuchar': 'Listen',
    'chat.callar': 'Stop',
    'chat.relato': 'Oral tradition story',
    'chat.difieren': 'The scripts differ',
    'chat.seguridad': 'Tell your guide or the park staff',
    'chat.abstencion': 'Your question is saved so the park staff can add the answer.',
    'chat.duda': 'Do you mean…?',
    'chat.ia': 'written by local AI · verified',
    'chat.error': 'Something went wrong. Ask your guide.',
    'ajustes.titulo': 'Settings',
    'ajustes.letra': 'Text size',
    'ajustes.contraste': 'High contrast',
    'ajustes.idioma': 'Language',
    'ajustes.cerrar': 'Done',
    'pie.panel': 'Park panel',
  },
};

let idioma = 'es';
export const getIdioma = () => idioma;
export function setIdioma(l) { idioma = textos[l] ? l : 'es'; document.documentElement.lang = idioma; }

export function t(clave, vars = {}) {
  const s = textos[idioma]?.[clave] ?? textos.es[clave] ?? clave;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/** Rellena los elementos con data-t="clave" (texto) y data-t-ph="clave" (placeholder). */
export function traducirDOM(raiz = document) {
  raiz.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  raiz.querySelectorAll('[data-t-ph]').forEach((el) => { el.placeholder = t(el.dataset.tPh); });
}
