import * as vig from './vigencia.js';

const CLAVE = 'fray-cromos-ganados';
let ids;
try { ids = new Set(JSON.parse(localStorage.getItem(CLAVE) || '[]')); }
catch { ids = new Set(); }

export const ganados = () => [...ids];
export const total = () => ids.size;

const sobres = [];
let mostrando = false;
let dialogo;

vig.alCambiar(({ vigente }) => {
  if (vigente) return;
  sobres.length = 0;
  if (dialogo?.open) dialogo.close();
  dialogo?.replaceChildren();
});

function elemento(etiqueta, texto) {
  const nodo = document.createElement(etiqueta);
  nodo.textContent = texto;
  return nodo;
}

export async function abrirSobre(id) {
  if (!id || sobres.includes(id)) return;
  sobres.push(id);
  if (mostrando) return;
  mostrando = true;
  try {
    while (sobres.length && vig.verificarVigencia().vigente) {
      await mostrar(sobres.shift());
    }
  } finally {
    sobres.length = 0;
    mostrando = false;
  }
}

async function mostrar(id) {
  const respuesta = await fetch(new URL('../contenido/cromos.json', import.meta.url));
  if (!respuesta.ok) return;
  const { cromos, fuentes } = await respuesta.json();
  const cromo = cromos.find((c) => c.id === id);
  if (!cromo || !vig.verificarVigencia().vigente) return;

  if (!dialogo) {
    dialogo = elemento('dialog', '');
    dialogo.className = 'sobre-cromo';
    dialogo.setAttribute('aria-labelledby', 'sobre-cromo-titulo');
    document.body.append(dialogo);
  }
  const repetido = ids.has(id);
  const titulo = elemento('h2', repetido ? 'Ya lo tienes' : 'Sobre de estación');
  titulo.id = 'sobre-cromo-titulo';
  const accion = elemento('button', repetido ? 'Cerrar' : 'Abrir sobre');
  dialogo.removeAttribute('data-abierto');
  dialogo.replaceChildren(titulo, accion);
  accion.onclick = () => {
    if (repetido || !vig.verificarVigencia().vigente) { dialogo.close(); return; }
    titulo.textContent = cromo.nombre;
    const dato = elemento('p', cromo.dato);
    const cita = elemento('p', `${fuentes[cromo.cita.guion]} · p. ${cromo.cita.pagina}`);
    if (cromo.tipo === 'relato') accion.before(elemento('p', 'Relato de tradición oral'));
    accion.before(dato, cita);
    dialogo.setAttribute('data-abierto', '');
    accion.textContent = 'Pegar';
    ids.add(id);
    try { localStorage.setItem(CLAVE, JSON.stringify(ganados())); } catch { /* solo en esta sesión */ }
    accion.onclick = () => dialogo.close();
  };
  const cerrado = new Promise((resolver) => dialogo.addEventListener('close', resolver, { once: true }));
  dialogo.showModal();
  await cerrado;
  dialogo.replaceChildren();
}

document.addEventListener('fray:cromo', (evento) => {
  abrirSobre(evento.detail?.id).catch((error) => console.warn('[cromos]', error));
});
