// Panel del parque: el personal edita, importa y exporta fichas sin tocar código.
// Cada guardado crea una versión nueva del paquete en el dispositivo (IndexedDB) y reindexa el motor.

import { TIPOS, TEMAS, ESTADOS } from './panel-config.js';
import { hayPin, definirPin, comprobarPin, sesionActiva, restablecer, LARGO_MINIMO } from './panel-pin.js';
import { cargarPaquete, paqueteBase, guardarVersion, versiones, avisarCambio } from './ui-paquete.js';
import { urlBase, urlBaseGuardada, urlPorDefecto, urlSubida, guardarUrlBase, guardarUrlSubida, arrancarSync, sync } from './ui-sync.js';
import { fray as cargarFray, claveQR } from './ui-motor.js';
import { generarQR } from './qr-estacion.js';
import { asegurarVigencia, estadoVigencia } from './vigencia.js';

const $ = (s) => document.querySelector(s);
const P = { paquete: null, origen: null, motor: null, editando: null /* id o null si es nueva */ };

// ---------- Utilidades ----------
function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = texto;
  return n;
}
function opciones(select, pares, vacio) {
  select.replaceChildren();
  if (vacio) select.append(new Option(vacio, ''));
  for (const [v, txt] of pares) select.append(new Option(txt, v));
}
function toast(msg, ms = 3500) {
  const t = el('div', 'toast', msg);
  t.setAttribute('role', 'status');
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = el('a');
  a.href = url; a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const nombreEstacion = (id) => P.paquete.estaciones.find((s) => s.id === id)?.nombre || (id ? id : 'General');
const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const fecha = (iso) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

// ---------- Guardar y reindexar ----------
// Cada acción que cambia o saca datos comprueba la sesión ella misma (no basta con haber entrado).
function exigirSesion() {
  if (sesionActiva()) return true;
  mostrarLogin('La sesión se cerró por inactividad. Escribe el PIN otra vez.');
  return false;
}

async function publicar(paquete, nota) {
  if (!exigirSesion()) throw new Error('Sin sesión');
  toast('Guardando… Fray está reindexando las fichas.');
  const nuevo = await guardarVersion(paquete, nota);
  P.paquete = nuevo;
  P.origen = 'dispositivo';
  pintarTodo();
  P.motor = await cargarFray();
  await P.motor.cargar(nuevo); // reindexa en el dispositivo (con el motor real puede tardar unos segundos)
  return nuevo;
}

// ---------- Validación de una ficha (contrato §1) ----------
function validarFicha(f, paquete) {
  const errores = [];
  if (!/^[a-z0-9-]+$/.test(f.id || '')) errores.push('Identificador vacío o con caracteres no permitidos.');
  if (!f.titulo?.trim()) errores.push('Falta el título.');
  if (!f.texto?.trim()) errores.push('Falta el texto del guion.');
  if (!f.breve?.trim()) errores.push('Falta la respuesta breve.');
  else if (f.texto && !normEsp(f.texto).includes(normEsp(f.breve).replace(/[.\s]+$/, ''))) {
    const msg = 'La respuesta breve debe ser texto copiado del propio texto.';
    if (f.estado === 'validado') errores.push(msg); // en borrador se permite, pero no se puede validar así
  }
  if (!TIPOS.includes(f.tipo)) errores.push(`Tipo no válido: ${f.tipo}`);
  if (f.tema && !TEMAS.includes(f.tema)) errores.push(`Tema no válido: ${f.tema}`);
  if (f.estacion && !paquete.estaciones.some((s) => s.id === f.estacion)) errores.push(`Estación desconocida: ${f.estacion}`);
  if (!f.citas?.length) errores.push('Toda ficha necesita al menos una cita (guion y página).');
  for (const c of f.citas || []) {
    const fu = paquete.fuentes?.[c.guion];
    if (!fu) errores.push(`Guion desconocido: ${c.guion}`);
    else if (!(c.pagina >= 1 && c.pagina <= (fu.paginas || 9999))) errores.push(`Página fuera de rango en ${c.guion}: ${c.pagina}`);
  }
  return errores;
}
// Compara sin mayúsculas iniciales, espacios repetidos ni comillas tipográficas
function normEsp(s) {
  return String(s).toLowerCase().replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

// ---------- Lista de fichas ----------
function pintarFiltros() {
  const ests = [...P.paquete.estaciones].sort((a, b) => a.orden - b.orden).map((s) => [s.id, s.nombre]);
  opciones($('#f-estacion'), [...ests, ['__general', 'General (sin estación)']], 'Todas las estaciones');
  opciones($('#f-tipo'), TIPOS.map((x) => [x, x]), 'Todos los tipos');
}

function pintarLista() {
  const q = $('#f-buscar').value.toLowerCase();
  const est = $('#f-estacion').value;
  const tipo = $('#f-tipo').value;
  const estado = $('#f-estado').value;
  const tb = $('#tbody-fichas');
  tb.replaceChildren();
  const fs = P.paquete.fichas.filter((f) => {
    if (q && ![f.titulo, f.texto, ...(f.preguntas || [])].join(' ').toLowerCase().includes(q)) return false;
    if (est === '__general' ? f.estacion : est && f.estacion !== est) return false;
    if (tipo && f.tipo !== tipo) return false;
    if (estado === 'bloqueada' ? !f.bloqueada : estado && f.estado !== estado) return false;
    return true;
  });
  for (const f of fs) {
    const tr = el('tr', 'fila');
    tr.tabIndex = 0;
    tr.append(el('td', null, f.titulo), el('td', null, nombreEstacion(f.estacion)), el('td', null, f.tipo));
    tr.append(el('td', null, (f.citas || []).map((c) => `${c.guion} p. ${c.pagina}`).join(', ')));
    const td = el('td');
    td.append(el('span', `badge badge-${f.estado}`, f.estado));
    if (f.bloqueada) td.append(el('span', 'badge badge-bloqueada', 'bloqueada'));
    tr.append(td);
    tr.onclick = () => abrirEditor(f);
    tr.onkeydown = (e) => { if (e.key === 'Enter') abrirEditor(f); };
    tb.append(tr);
  }
  if (!fs.length) {
    const tr = el('tr');
    const td = el('td', null, 'No hay fichas con esos filtros.');
    td.colSpan = 5;
    tr.append(td);
    tb.append(tr);
  }
}

// ---------- Editor ----------
function filaCita(c = {}) {
  const fila = el('div', 'cita-fila');
  const sel = el('select');
  opciones(sel, Object.entries(P.paquete.fuentes || {}).map(([k, v]) => [k, v.titulo]));
  if (c.guion) sel.value = c.guion;
  const pag = el('input');
  pag.type = 'number'; pag.min = '1'; pag.placeholder = 'Página'; pag.value = c.pagina || '';
  pag.setAttribute('aria-label', 'Página');
  const quitar = el('button', 'btn btn-mini btn-peligro', 'Quitar');
  quitar.type = 'button';
  quitar.onclick = () => fila.remove();
  fila.append(sel, pag, quitar);
  return fila;
}

function abrirEditor(f, { nueva = false } = {}) {
  const form = $('#form-ficha');
  P.editando = nueva ? null : f.id;
  $('#ed-titulo-form').textContent = nueva ? 'Nueva ficha' : `Editar: ${f.titulo}`;
  opciones(form.estacion, [...P.paquete.estaciones].sort((a, b) => a.orden - b.orden).map((s) => [s.id, s.nombre]), 'General (sin estación)');
  opciones(form.tema, TEMAS.map((x) => [x, x]));
  opciones(form.tipo, TIPOS.map((x) => [x, x]));
  opciones(form.estado, ESTADOS.map((x) => [x, x]));
  form.titulo.value = f.titulo || '';
  form.id.value = f.id || '';
  form.id.readOnly = !nueva;
  form.estacion.value = f.estacion || '';
  form.tema.value = f.tema || 'flora';
  form.tipo.value = f.tipo || 'ciencia';
  form.estado.value = f.estado || 'borrador';
  form.texto.value = f.texto || '';
  form.breve.value = f.breve || '';
  form.preguntas.value = (f.preguntas || []).join('\n');
  form.bloqueada.checked = !!f.bloqueada;
  form.motivo.value = f.motivo || '';
  const citas = $('#ed-citas');
  citas.replaceChildren(...(f.citas?.length ? f.citas : [{}]).map(filaCita));
  $('#ed-errores').textContent = '';
  $('#btn-borrar').hidden = nueva;
  $('#lista-fichas').hidden = true;
  form.hidden = false;
  form.titulo.focus();
}

function leerEditor() {
  const form = $('#form-ficha');
  return {
    id: form.id.value.trim(),
    estacion: form.estacion.value || null,
    tema: form.tema.value,
    tipo: form.tipo.value,
    titulo: form.titulo.value.trim(),
    texto: form.texto.value.trim(),
    breve: form.breve.value.trim(),
    citas: [...document.querySelectorAll('#ed-citas .cita-fila')]
      .map((r) => ({ guion: r.querySelector('select').value, pagina: Number(r.querySelector('input').value) }))
      .filter((c) => c.guion && c.pagina),
    preguntas: form.preguntas.value.split('\n').map((s) => s.trim()).filter(Boolean),
    bloqueada: form.bloqueada.checked,
    motivo: form.motivo.value.trim() || null,
    estado: form.estado.value,
  };
}

function cerrarEditor() {
  $('#form-ficha').hidden = true;
  $('#lista-fichas').hidden = false;
  pintarLista();
}

async function guardarFicha(e) {
  e.preventDefault();
  if (!exigirSesion()) return;
  const f = leerEditor();
  const errores = validarFicha(f, P.paquete);
  if (!P.editando && P.paquete.fichas.some((x) => x.id === f.id)) errores.push('Ya existe una ficha con ese identificador.');
  if (errores.length) { $('#ed-errores').textContent = errores.join(' '); return; }
  const p = structuredClone(P.paquete);
  const i = p.fichas.findIndex((x) => x.id === f.id);
  if (i >= 0) p.fichas[i] = { ...p.fichas[i], ...f }; else p.fichas.push(f);
  await publicar(p, `${i >= 0 ? 'Editada' : 'Nueva'}: ${f.id}`);
  cerrarEditor();
  toast(f.estado === 'validado' && !f.bloqueada
    ? 'Listo: Fray ya responde con la ficha nueva.'
    : 'Guardada. Fray no la usa hasta que esté validada y sin bloqueo.');
}

async function borrarFicha() {
  if (!exigirSesion()) return;
  if (!P.editando || !confirm('¿Borrar esta ficha? Puedes recuperarla volviendo a la versión anterior.')) return;
  const p = structuredClone(P.paquete);
  p.fichas = p.fichas.filter((x) => x.id !== P.editando);
  p.conflictos = (p.conflictos || []).filter((c) => !c.fichas.includes(P.editando));
  await publicar(p, `Borrada: ${P.editando}`);
  cerrarEditor();
  toast('Ficha borrada.');
}

// ---------- Importar / exportar ----------
const COLUMNAS = ['id', 'estacion', 'tema', 'tipo', 'titulo', 'texto', 'breve', 'citas', 'preguntas', 'estado', 'bloqueada', 'motivo'];

// CSV con comillas (RFC 4180). Detecta si el separador es «,» o «;» (Excel en español usa «;»).
function leerCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const primera = texto.split(/\r?\n/, 1)[0];
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const [cab, ...resto] = filas.filter((f) => f.some((x) => x.trim()));
  const claves = cab.map((h) => h.trim().toLowerCase());
  return resto.map((f) => Object.fromEntries(claves.map((k, i) => [k, (f[i] ?? '').trim()])));
}

// Contra inyección de fórmulas en Excel/LibreOffice: si empieza por = + - @ tabulador o retorno, se antepone «'»
const csvCampo = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
function aCSV(filas, columnas) {
  return '﻿' + [columnas.join(','), ...filas.map((f) => columnas.map((c) => csvCampo(f[c])).join(','))].join('\r\n');
}

// Fila del CSV → ficha. citas: "UTON2024:8;NORTE:3" · preguntas: separadas por «|»
function fichaDeFila(r) {
  return {
    id: r.id || slug(r.titulo || ''),
    estacion: r.estacion || null,
    tema: r.tema || 'flora',
    tipo: r.tipo || 'ciencia',
    titulo: r.titulo,
    texto: r.texto,
    breve: r.breve,
    citas: (r.citas || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean).map((s) => {
      const [guion, pagina] = s.split(':');
      return { guion: guion.trim(), pagina: Number(pagina) };
    }),
    preguntas: (r.preguntas || '').split('|').map((s) => s.trim()).filter(Boolean),
    bloqueada: /^(si|sí|true|1|x)$/i.test(r.bloqueada || ''),
    motivo: r.motivo || null,
    estado: ESTADOS.includes(r.estado) ? r.estado : 'borrador',
  };
}

async function importar(archivo) {
  if (!exigirSesion()) return;
  const res = $('#import-resultado');
  res.replaceChildren();
  const texto = await archivo.text();
  let fichas = [];
  let completo = null;
  try {
    if (/\.json$/i.test(archivo.name) || texto.trim().startsWith('{') || texto.trim().startsWith('[')) {
      const j = JSON.parse(texto);
      if (Array.isArray(j)) fichas = j;
      else if (j.estaciones && j.fichas) completo = j;
      else if (j.fichas) fichas = j.fichas;
      else throw new Error('El JSON no trae fichas.');
    } else {
      fichas = leerCSV(texto).map(fichaDeFila);
    }
  } catch (e) {
    res.append(el('p', 'error', `No pude leer el archivo: ${e.message}`));
    return;
  }

  if (completo) {
    const malas = completo.fichas.map((f) => [f.id, validarFicha(f, completo)]).filter(([, e]) => e.length);
    if (malas.length) {
      res.append(el('p', 'error', `El paquete tiene ${malas.length} fichas con problemas; no se cargó.`));
      malas.slice(0, 20).forEach(([id, e]) => res.append(el('p', null, `• ${id}: ${e.join(' ')}`)));
      return;
    }
    if (!confirm(`Reemplazar el paquete actual por «${completo.version || archivo.name}» (${completo.fichas.length} fichas)?`)) return;
    // Cambiar la clave de los QR invalida los QR impresos: se pide una confirmación aparte
    if ((completo.claveQR || null) !== (P.paquete.claveQR || null)
      && !confirm('ATENCIÓN: este paquete trae otra clave para los QR de estación. Los QR impresos con la clave actual dejarán de funcionar. ¿Aceptas cambiar la clave?')) return;
    await publicar(completo, `Paquete completo importado: ${archivo.name}`);
    res.append(el('p', 'ok', `Listo: paquete cargado con ${completo.fichas.length} fichas. Fray ya responde con él.`));
    return;
  }

  const p = structuredClone(P.paquete);
  let nuevas = 0, reemplazadas = 0;
  const errores = [];
  for (const f of fichas) {
    const e = validarFicha(f, p);
    if (e.length) { errores.push(`${f.id || f.titulo || '(sin id)'}: ${e.join(' ')}`); continue; }
    const i = p.fichas.findIndex((x) => x.id === f.id);
    if (i >= 0) { p.fichas[i] = f; reemplazadas++; } else { p.fichas.push(f); nuevas++; }
  }
  if (nuevas + reemplazadas) {
    await publicar(p, `Importadas ${nuevas} nuevas y ${reemplazadas} reemplazadas (${archivo.name})`);
    res.append(el('p', 'ok', `Listo: ${nuevas} fichas nuevas y ${reemplazadas} reemplazadas. Fray ya responde con ellas.`));
  }
  if (errores.length) {
    res.append(el('p', 'error', `${errores.length} fichas no se importaron:`));
    errores.slice(0, 30).forEach((m) => res.append(el('p', null, `• ${m}`)));
  }
  if (!fichas.length) res.append(el('p', 'error', 'El archivo no trae fichas.'));
}

function plantillaCSV() {
  const ejemplo = {
    id: 'mi-estacion-tema', estacion: 'lunares', tema: 'geologia', tipo: 'ciencia', titulo: 'Título corto de la ficha',
    texto: 'Texto copiado del guion…', breve: 'Una frase copiada del texto…', citas: 'UTON2024:8;NORTE:3',
    preguntas: '¿Primera forma de preguntar?|¿Otra forma?', estado: 'borrador', bloqueada: 'no', motivo: '',
  };
  descargar('plantilla-fichas.csv', aCSV([ejemplo], COLUMNAS), 'text/csv;charset=utf-8');
}
function plantillaJSON() {
  const ejemplo = [{
    id: 'mi-estacion-tema', estacion: 'lunares', tema: 'geologia', tipo: 'ciencia', titulo: 'Título corto de la ficha',
    texto: 'Texto copiado del guion…', breve: 'Una frase copiada del texto…', citas: [{ guion: 'UTON2024', pagina: 8 }],
    preguntas: ['¿Primera forma de preguntar?'], bloqueada: false, motivo: null, estado: 'borrador',
  }];
  descargar('plantilla-fichas.json', JSON.stringify(ejemplo, null, 2), 'application/json');
}
function exportar() {
  if (!exigirSesion()) return;
  descargar(`paquete-${P.paquete.version || 'fray'}.json`, JSON.stringify(P.paquete, null, 2), 'application/json');
}
// Nombre fijo: herramientas/Publicar.cmd lo busca en Descargas (docs/operacion-base.md)
function exportarParaPublicar() {
  if (!exigirSesion()) return;
  descargar('paquete-publicar.json', JSON.stringify({ ...P.paquete, exportadoEn: new Date().toISOString() }, null, 2), 'application/json');
  $('#export-resultado').textContent = `Listo: paquete-publicar.json (versión ${P.paquete.version}) en Descargas. ` +
    'Ahora haz doble clic en «Publicar» en el escritorio del PC de Brisas.';
}

// ---------- Preguntas sin respuesta ----------
async function pintarSinRespuesta() {
  const lista = [...(await P.motor.sinRespuesta())].reverse();
  const tb = $('#tbody-sin');
  tb.replaceChildren();
  for (const s of lista) {
    const tr = el('tr');
    tr.append(el('td', null, fecha(s.fecha)), el('td', null, nombreEstacion(s.estacion)), el('td', null, s.texto));
    const td = el('td');
    const b = el('button', 'btn btn-mini btn-flor', 'Crear ficha con esta pregunta');
    b.onclick = () => {
      cambiarTab('fichas');
      abrirEditor({ preguntas: [s.texto], estacion: s.estacion, estado: 'borrador', citas: [] }, { nueva: true });
    };
    td.append(b);
    tr.append(td);
    tb.append(tr);
  }
  if (!lista.length) {
    const tr = el('tr');
    const td = el('td', null, 'No hay preguntas sin respuesta.');
    td.colSpan = 4;
    tr.append(td);
    tb.append(tr);
  }
  return lista;
}

// ---------- Versiones ----------
async function pintarVersiones() {
  const vs = await versiones();
  const tb = $('#tbody-versiones');
  tb.replaceChildren();
  vs.forEach((v, i) => {
    const tr = el('tr');
    tr.append(el('td', null, v.version + (i === 0 ? ' (vigente)' : '')), el('td', null, fecha(v.fecha)), el('td', null, v.nota), el('td', null, String(v.paquete.fichas.length)));
    const td = el('td');
    if (i > 0) {
      const b = el('button', 'btn btn-mini btn-linea', 'Volver a esta versión');
      b.onclick = async () => {
        if (!exigirSesion() || !confirm(`¿Volver a la versión ${v.version}?`)) return;
        await publicar(v.paquete, `Vuelta a ${v.version}`);
        toast(`Listo: Fray responde otra vez con la versión ${v.version}.`);
      };
      td.append(b);
    }
    tr.append(td);
    tb.append(tr);
  });
  if (!vs.length) {
    const tr = el('tr');
    const td = el('td', null, `Aún no hay cambios guardados en este dispositivo. Se usa el paquete base (${P.origen === 'ejemplo' ? 'de ejemplo' : 'contenido/paquete.json'}).`);
    td.colSpan = 5;
    tr.append(td);
    tb.append(tr);
  }
}

// ---------- QR de estación ----------
async function pintarQR() {
  const sel = $('#qr-estacion');
  if (!sel.options.length) opciones(sel, [...P.paquete.estaciones].sort((a, b) => a.orden - b.orden).map((s) => [s.id, s.nombre]));
  const est = P.paquete.estaciones.find((s) => s.id === sel.value);
  const caja = $('#qr-tarjeta');
  caja.replaceChildren();
  if (!est || !window.qrcode) return;
  const clave = await claveQR(P.paquete);
  $('#qr-aviso').hidden = !!P.paquete.claveQR;
  const texto = await generarQR(est.id, clave);
  const qr = window.qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const tarjeta = el('div', 'tarjeta-qr');
  tarjeta.append(el('h2', null, est.nombre));
  if (est.altitud?.m) tarjeta.append(el('p', null, `${est.altitud.m.toLocaleString('es-CO')} m s. n. m.`));
  const img = el('img');
  img.src = qr.createDataURL(10, 2);
  img.alt = `Código QR de la estación ${est.nombre}`;
  tarjeta.append(img, el('p', null, 'Escanéalo con Fray para preguntar sobre esta estación'), el('small', null, texto));
  caja.append(tarjeta);
}

// ---------- Sincronización con la base (contrato §5.5) ----------
let tokenPanel = ''; // solo en memoria: no se guarda en el dispositivo

async function pintarSync() {
  const e = await sync.estadoSync();
  $('#sync-estado').textContent = e.texto;
  $('#sync-detalle').textContent = [
    `Versión actual: ${e.versionActual || '—'}`,
    `anterior: ${e.versionAnterior || '—'}`,
    `preguntas pendientes por subir: ${e.pendientes}`,
    e.activo ? `actualizaciones desde: ${e.urlBase}` : 'sin dirección (solo USB)',
    `subida de preguntas: ${e.urlSubida || 'sin servidor (se quedan en cola en el teléfono)'}`,
    e.ultimoError ? `último error: ${e.ultimoError}` : '',
  ].filter(Boolean).join(' · ');
  $('#sync-url').value = urlBaseGuardada() || '';
  $('#sync-url').placeholder = urlPorDefecto() || 'http://192.168.4.1:8090';
  $('#sync-subida').value = urlSubida() || '';
}

async function alPaqueteSync(p) {
  P.paquete = p;
  P.origen = 'sync';
  pintarTodo();
  avisarCambio(p.version);
  // Reindexa en segundo plano: la sincronización no espera al índice
  cargarFray().then((m) => { P.motor = m; return m.cargar(p); }).catch((e) => console.error(e));
}

function arrancar() {
  return arrancarSync({ versionLocal: P.incluido?.version, alPaqueteNuevo: alPaqueteSync, alAvisos: () => {} });
}

async function pintarBandeja() {
  const tb = $('#tbody-bandeja');
  tb.replaceChildren();
  const fila = (txt) => { const tr = el('tr'); const td = el('td', null, txt); td.colSpan = 5; tr.append(td); tb.append(tr); };
  const base = urlSubida();
  if (!base) return fila('Configura primero el servidor de la base (subida de preguntas).');
  let j;
  try {
    const r = await fetch(`${base}/bandeja`, { headers: tokenPanel ? { Authorization: `Bearer ${tokenPanel}` } : {} });
    if (r.status === 401 || r.status === 403) return fila('La base pide el token del panel.');
    j = await r.json();
  } catch (e) {
    return fila(`No pude hablar con la base (${e.message}).`);
  }
  const grupos = j?.grupos || [];
  for (const g of grupos) {
    const tr = el('tr');
    tr.append(el('td', null, String(g.conteo)), el('td', null, g.texto), el('td', null, nombreEstacion(g.estacion)), el('td', null, g.ultima || ''));
    const td = el('td');
    const b = el('button', 'btn btn-mini btn-flor', 'Crear ficha desde esta pregunta');
    b.onclick = () => {
      cambiarTab('fichas');
      const variantes = (g.variantes || []).map((v) => (typeof v === 'string' ? v : v?.texto)).filter((v) => v && v !== g.texto);
      abrirEditor({ preguntas: [g.texto, ...variantes.slice(0, 4)], estacion: g.estacion, estado: 'borrador', citas: [] }, { nueva: true });
    };
    td.append(b);
    tr.append(td);
    tb.append(tr);
  }
  if (!grupos.length) fila('La bandeja está vacía.');
}

function conectarSync() {
  $('#btn-sync-ahora').onclick = async () => {
    if (!exigirSesion()) return;
    $('#sync-resultado').textContent = 'Sincronizando…';
    const r = await sync.sincronizar();
    $('#sync-resultado').textContent = r.ok
      ? `Listo: ${r.subidas} preguntas subidas${r.paqueteNuevo ? `, paquete nuevo ${r.paqueteNuevo}` : ''}${r.avisosNuevos ? ', avisos actualizados' : ''}.`
      : `No se pudo: ${r.error}`;
    pintarSync();
  };
  $('#btn-sync-atras').onclick = async () => {
    if (!exigirSesion() || !confirm('¿Volver a la versión anterior del paquete firmado?')) return;
    const r = await sync.volverAtras();
    $('#sync-resultado').textContent = r.ok ? `Listo: Fray responde otra vez con la versión ${r.version}.` : `No se pudo: ${r.motivo}`;
    pintarSync();
  };
  $('#archivo-usb').onchange = async (e) => {
    const a = e.target.files[0];
    e.target.value = '';
    if (!a || !exigirSesion()) return;
    const r = await sync.importarPaquete(a);
    $('#sync-resultado').textContent = r.ok ? `Listo: paquete ${r.version} verificado e instalado. Fray ya responde con él.` : `No se instaló: ${r.motivo}`;
    pintarSync();
  };
  $('#btn-sync-exportar').onclick = async () => {
    if (!exigirSesion()) return;
    const vaciar = confirm('¿Vaciar la cola del dispositivo después de exportar? (Acepta solo si vas a llevar el archivo a la base.)');
    const r = await sync.exportarCola({ vaciar });
    descargar(r.nombre, r.texto, 'application/json');
    $('#sync-resultado').textContent = `Exportadas ${r.cantidad} preguntas en ${r.nombre}.`;
    pintarSync();
  };
  $('#btn-sync-url').onclick = async () => {
    if (!exigirSesion()) return;
    try {
      const u = guardarUrlBase($('#sync-url').value);
      await arrancar();
      $('#sync-resultado').textContent = u ? `Dirección guardada: ${u}.` : `Vacío: actualizaciones desde ${urlBase() || 'ningún lado (solo USB)'}.`;
    } catch (err) { $('#sync-resultado').textContent = err.message; }
    pintarSync();
  };
  $('#btn-sync-subida').onclick = async () => {
    if (!exigirSesion()) return;
    try {
      const u = guardarUrlSubida($('#sync-subida').value);
      await arrancar();
      $('#sync-resultado').textContent = u ? `Las preguntas se subirán a ${u}.` : 'Sin servidor: las preguntas se quedan en cola en el teléfono.';
    } catch (err) { $('#sync-resultado').textContent = err.message; }
    pintarSync();
  };
  $('#btn-bandeja').onclick = () => {
    if (!exigirSesion()) return;
    tokenPanel = $('#sync-token').value;
    pintarBandeja();
  };
}

// ---------- Pestañas y arranque ----------
function cambiarTab(nombre) {
  document.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === nombre));
  document.querySelectorAll('[data-panel]').forEach((s) => { s.hidden = s.dataset.panel !== nombre; });
  if (nombre === 'sin') pintarSinRespuesta();
  if (nombre === 'versiones') pintarVersiones();
  if (nombre === 'qr') pintarQR();
  if (nombre === 'sync') pintarSync();
}

function pintarTodo() {
  const p = P.paquete;
  const n = p.fichas.length;
  const val = p.fichas.filter((f) => f.estado === 'validado' && !f.bloqueada).length;
  $('#resumen').textContent = `Paquete ${p.version} · ${n} fichas (${val} validadas y activas) · origen: ${({ dispositivo: 'guardado en este dispositivo (Panel)', sync: 'paquete firmado de la base', ejemplo: 'paquete de ejemplo' })[P.origen] || 'contenido/paquete.json'}`;
  const aviso = $('#aviso-ejemplo');
  aviso.hidden = !p.ejemplo;
  aviso.textContent = 'Estás viendo el PAQUETE DE EJEMPLO (ejemplo/paquete-ejemplo.json). Llegará el paquete oficial en contenido/paquete.json.';
  pintarFiltros();
  pintarLista();
}

let iniciado = false;
async function entrar() {
  $('#login').hidden = true;
  $('#panel').hidden = false;
  if (iniciado) return; // volver tras una sesión caducada: no se recarga ni se duplican eventos
  iniciado = true;
  // Vigencia (contrato §7, decisión 11): el Panel vence igual que la app del visitante y se renueva igual (con señal).
  const vig = await asegurarVigencia().catch(() => estadoVigencia());
  let carga = null;
  if (vig.estado !== 'vencido') carga = await cargarPaquete().catch((e) => { if (e?.vencido) return null; throw e; });
  if (!carga) {
    iniciado = false;
    mostrarLogin('El contenido del parque en este dispositivo venció (24 h) y se borró. Conéctate a internet y vuelve a entrar para renovarlo.');
    return;
  }
  const { paquete, origen, incluido } = carga;
  P.paquete = paquete;
  P.origen = origen;
  P.incluido = incluido;
  conectarSync();
  arrancar().catch((e) => console.warn('Sync:', e));
  pintarTodo();
  // El motor se carga en segundo plano: la lista se puede usar ya
  P.motor = await cargarFray();
  P.motor.cargar(paquete).catch((e) => console.error(e));

  document.querySelectorAll('[role="tab"]').forEach((b) => { b.onclick = () => cambiarTab(b.dataset.tab); });
  for (const id of ['#f-buscar', '#f-estacion', '#f-tipo', '#f-estado']) $(id).addEventListener('input', pintarLista);
  $('#btn-nueva').onclick = () => abrirEditor({ estado: 'borrador', citas: [] }, { nueva: true });
  $('#btn-cancelar').onclick = cerrarEditor;
  $('#btn-borrar').onclick = borrarFicha;
  $('#btn-cita').onclick = () => $('#ed-citas').append(filaCita());
  $('#form-ficha').onsubmit = guardarFicha;
  $('#form-ficha').titulo.addEventListener('input', (e) => {
    const f = $('#form-ficha');
    if (!f.id.readOnly) f.id.value = slug([f.estacion.value, e.target.value].filter(Boolean).join(' '));
  });
  $('#archivo').onchange = (e) => { const a = e.target.files[0]; if (a) importar(a); e.target.value = ''; };
  $('#btn-plantilla-csv').onclick = plantillaCSV;
  $('#btn-plantilla-json').onclick = plantillaJSON;
  $('#btn-exportar').onclick = exportar;
  $('#btn-exportar-publicar').onclick = exportarParaPublicar;
  $('#btn-sin-csv').onclick = async () => {
    if (!exigirSesion()) return;
    const l = await P.motor.sinRespuesta();
    descargar('preguntas-sin-respuesta.csv', aCSV(l.map((s) => ({ ...s, estacion: s.estacion || '' })), ['fecha', 'estacion', 'texto']), 'text/csv;charset=utf-8');
  };
  $('#btn-sin-limpiar').onclick = async () => {
    if (!exigirSesion() || !confirm('¿Borrar todas las preguntas sin respuesta de este dispositivo?')) return;
    await P.motor.limpiarSinRespuesta();
    pintarSinRespuesta();
  };
  $('#qr-estacion').onchange = pintarQR;
  $('#btn-base').onclick = async () => {
    if (!exigirSesion()) return;
    const { paquete, origen } = await paqueteBase();
    if (!confirm(`¿Volver al paquete que trae la app (${paquete.version}, ${paquete.fichas.length} fichas)? Las versiones guardadas siguen en la lista.`)) return;
    await publicar(paquete, `Paquete base (${origen === 'ejemplo' ? 'ejemplo' : 'contenido/paquete.json'} ${paquete.version})`);
    pintarVersiones();
    toast('Listo: Fray responde con el paquete base.');
  };
  $('#btn-imprimir').onclick = () => window.print();
}

// ---------- Entrada con PIN ----------
function mostrarLogin(mensaje = '') {
  const crear = !hayPin();
  $('#panel').hidden = true;
  $('#login').hidden = false;
  $('#login-ayuda').textContent = crear
    ? `Primer uso en este dispositivo: define el PIN del personal (${LARGO_MINIMO} a 12 números). Solo se guarda cifrado aquí.`
    : 'Solo para el personal del parque.';
  $('#pin-etiqueta').textContent = crear ? 'Nuevo PIN' : 'PIN del personal';
  $('#pin2').hidden = $('#pin2-etiqueta').hidden = !crear;
  $('#pin2').required = crear;
  $('#btn-entrar').textContent = crear ? 'Guardar PIN y entrar' : 'Entrar';
  $('#btn-restablecer').hidden = crear;
  $('#pin').value = $('#pin2').value = '';
  $('#pin-error').textContent = mensaje;
  $('#pin').focus();
}

$('#login').onsubmit = async (e) => {
  e.preventDefault();
  const pin = $('#pin').value;
  $('#pin-error').textContent = '';
  try {
    if (!hayPin()) {
      if (pin !== $('#pin2').value) throw new Error('Los dos PIN no coinciden.');
      await definirPin(pin);
    } else if (!(await comprobarPin(pin))) {
      await new Promise((r) => setTimeout(r, 800)); // freno a los intentos seguidos
      throw new Error('PIN incorrecto.');
    }
    entrar();
  } catch (err) {
    $('#pin-error').textContent = err.message;
  }
};

$('#btn-restablecer').onclick = async () => {
  if (!confirm('Restablecer el PIN borra en este dispositivo las versiones guardadas desde el Panel y las preguntas sin respuesta. Fray vuelve al paquete que trae la app. ¿Continuar?')) return;
  await restablecer();
  location.reload();
};

mostrarLogin();
