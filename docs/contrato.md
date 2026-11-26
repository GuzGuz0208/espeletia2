# Contrato entre contenido, motor e interfaz

Versión 1 · 26-nov-2026. Si cambias algo aquí, avisa en el PR.

## 1. `contenido/paquete.json` (lo produce el pipeline de contenido; lo edita el personal desde el Panel)
```jsonc
{
  "version": "2026-11-26.1",
  "actualizado": "2026-11-26",
  "fuentes": {
    "UTON2024": { "titulo": "Guion Ecoturístico UTON 2024", "paginas": 57 },
    "NORTE":    { "titulo": "Guión turístico (zona norte)", "paginas": 7 }
  },
  "estaciones": [
    { "id": "brisas", "nombre": "Brisas", "orden": 0, "altitud": null },
    { "id": "aguacerales", "nombre": "Aguacerales", "orden": 1,
      "altitud": { "m": 4160, "citas": [{ "guion": "UTON2024", "pagina": 5 }, { "guion": "NORTE", "pagina": 3 }] } }
    // arenales 4290 · lunares 4350 · tumbas 4460
  ],
  "fichas": [
    {
      "id": "lunares-gelifraccion",
      "estacion": "lunares",            // o null si es general
      "tema": "geologia",               // agua | flora | fauna | geologia | glaciar | clima | cultura | historia | normas | glosario
      "tipo": "ciencia",                // ciencia | relato | norma | glosario
      "titulo": "Gelifracción",
      "texto": "…texto literal o casi literal del guion…",
      "breve": "…1-2 frases literales del propio texto (respuesta corta)…",
      "citas": [{ "guion": "UTON2024", "pagina": 8 }],
      "preguntas": ["¿por qué se rompen las rocas?", "…"],   // formas de preguntar (ayudan a la búsqueda)
      "bloqueada": false,               // true = no se usa para responder (p. ej. alerta del volcán, tratamientos)
      "motivo": null,
      "estado": "validado"              // validado | borrador (lo marca el personal)
    }
  ],
  "conflictos": [
    { "tema": "Significado de Kumanday", "fichas": ["norte-kumanday", "uton-kumanday"],
      "nota": "El guion zona norte da traducciones; el UTON 2024 (p. 34) dice que no hay investigación suficiente." }
  ]
}
```
Reglas: `breve` debe ser texto del propio `texto` (extractivo). Toda ficha tiene al menos una cita. Las páginas son las del PDF.

## 2. Motor `js/fray.js` (módulo ES; corre en un Web Worker por dentro)
```js
import * as fray from './js/fray.js';
await fray.cargar(paquete);                 // construye el índice en el dispositivo (e5-small) y lo cachea en IndexedDB
const r = await fray.preguntar(texto, { estacion: 'lunares' });   // estacion opcional
// r = {
//   tipo: 'respuesta' | 'abstencion' | 'seguridad' | 'conflicto' | 'duda',
//   breve: string,            // respuesta corta (siempre texto del guion o mensaje fijo de seguridad/abstención)
//   ampliar: string | null,   // texto completo de la ficha
//   citas: [{ guion: 'UTON2024', titulo: 'Guion Ecoturístico UTON 2024', pagina: 8 }],
//   fichas: ['lunares-gelifraccion'],
//   tipoContenido: 'ciencia' | 'relato' | ...,   // para la etiqueta «Relato de tradición oral»
//   alternativas: [{ id, titulo }],              // si tipo === 'duda'
//   aviso: string | null      // p. ej. «Los guiones difieren»
// }
fray.sinRespuesta();          // [{ texto, estacion, fecha }] preguntas que terminaron en abstención (local, sin datos personales)
fray.limpiarSinRespuesta();
```
- `seguridad`: carril crítico (emergencia, síntomas o salud, comer o tocar plantas y animales, estado del volcán, clima o acceso de
  hoy). Mensaje fijo que remite al guía, con cita solo si el guion lo respalda.
- `abstencion`: sin respaldo suficiente, fuera de tema o premisa falsa no cubierta por los guiones.

## 3. Generación opcional `js/generador.js`
```js
const g = await generador.disponible();     // { listo, modelo, motor } — prueba http://127.0.0.1:8080 (llama-server)
const out = await generador.reescribir(r, pregunta, { timeoutMs: 6000, alTrozo }); // { texto, ok, fallas, ms }
```
Solo se llama con `r.tipo === 'respuesta'`. Si `ok === false` o hay timeout, la interfaz deja `r.breve`.

## 4. QR de estación (sin red)
Texto del QR: `FRAY1|<estacion>|<firma>` donde firma = HMAC-SHA256 truncado (8 hex) de `FRAY1|<estacion>` con la clave del
paquete. Se lee con jsQR en el dispositivo y se verifica sin internet. Un QR que no valide muestra «Este código no es del parque».
