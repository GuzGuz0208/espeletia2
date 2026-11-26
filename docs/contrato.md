# Contrato entre contenido, motor e interfaz

Versión 2 · 26-nov-2026 (agrega §5 Sincronización y §6 Avisos). Si cambias algo aquí, avisa en el PR.

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

## 5. Sincronización con la base (`js/sync.js`, `servidor/sync_base.py`, `herramientas/firmar_paquete.py`)
Ciclo (requisito 4; en las estaciones no hay señal): el dispositivo guarda en local las preguntas que terminaron en abstención →
cuando ve la base (wifi local de Brisas o nube) las sube → el personal las revisa en el panel, crea fichas citando guion y página
(o un documento oficial nuevo), valida y publica un paquete nuevo **firmado** + avisos del día → el dispositivo lo descarga,
verifica la firma **sin red**, lo activa (`fray.cargar`, reindexa) y conserva la versión anterior para volver atrás.

**Cero red en la demostración.** `sync.js` solo hace peticiones si se configura `urlBase`. En la demo en modo avión no se configura:
no hace nada, y el ciclo se muestra en la base (servidor + panel) o por USB. Nunca bloquea responder (todo va en segundo plano).

### 5.1 `manifest.json` (lo escribe `firmar_paquete.py`)
```jsonc
{
  "formato": 1,
  "version": "2026-11-26.4",          // solo se descarga si es mayor que la instalada (comparación numérica por partes)
  "sha256": "…64 hex…",               // de los bytes exactos de paquete.json publicado
  "avisos_sha256": "…64 hex…",        // de los bytes exactos de avisos.json publicado
  "publicado": "2026-11-26T15:20:55Z",
  "firma": "…base64…"                 // ECDSA P-256 / SHA-256, formato r||s (64 bytes, el de WebCrypto)
}
```
Texto firmado: `"FRAY1\n{version}\n{sha256}\n{avisos_sha256}\n{publicado}"` (una sola firma cubre paquete y avisos). La clave
pública va en `contenido/clave_publica.json` (JWK) y viaja con la app; la privada **nunca** entra al repo (vive en el PC de la
base: `--claves`, variable `FRAY_CLAVES` o, por omisión, `C:\Users\danna\espeletia-llm\claves\fray_privada.pem`). Si cambia la
clave, los dispositivos necesitan la nueva pública (se actualiza la app).

Se publica en `publicado/` (fuera de git): `manifest.json`, `paquete.json`, `avisos.json` y `fray-paquete-usb.json`
(`{formato: "fray-usb-1", manifest, paquete: "<texto>", avisos: "<texto>"}`, para copiar por USB). `firmar_paquete.py` se niega a
publicar si el paquete no pasa `validar_paquete.py`, si hay un aviso prohibido, o si el paquete cambió sin subir la versión.

### 5.2 Cola de preguntas sin respuesta (en el dispositivo)
```jsonc
{ "id": "uuid aleatorio", "texto": "¿hay restaurante en brisas?", "estacion": "brisas",   // estacion o null
  "fecha": "2026-11-26",            // solo el día, nunca la hora
  "versionPaquete": "2026-11-26.3" }
// al subir: { "dispositivo": "uuid aleatorio del equipo (no del visitante)", "preguntas": [ … ] }
```
Sin datos personales: texto recortado a 200 caracteres; correos y números largos se tapan (`[correo]`, `[número]`) en el
dispositivo y otra vez en el servidor. Máximo 500 en cola (se descartan las más viejas).

### 5.3 API del servidor de la base
| Ruta | Qué hace |
|---|---|
| `GET /manifest.json`, `/paquete.json`, `/avisos.json`, `/fray-paquete-usb.json` | Sirve lo publicado (solo esos cuatro archivos) |
| `POST /sin-respuesta` | Cuerpo `{dispositivo, preguntas: [...]}` (máx. 64 KB). Responde `{ok: true, ids: [...]}`; idempotente por `id`. Guarda en `datos/bandeja.jsonl` |
| `GET /bandeja` | `{ok, grupos: [{texto, normalizado, estacion, conteo, dispositivos, primera, ultima, versiones, variantes}]}`, por conteo. Si existe `FRAY_TOKEN_PANEL`, exige `Authorization: Bearer <token>` |
| `GET /salud` | `{ok: true}` |

CORS solo para los orígenes dados con `--origen` (el de la app). El cliente **vacía de la cola solo los ids que el servidor
confirma**; si la base no responde, la cola se conserva.

### 5.4 `js/sync.js` (módulo ES, sin dependencias)
```js
import * as sync from './js/sync.js';
sync.iniciarSync({ urlBase, clavePublicaJwk, alPaqueteNuevo, alAvisos, versionLocal,
                   intervaloMin: 15, reintentoMin: 1, maxMin: 60 });   // sin urlBase: solo modo USB, cero red
await sync.sincronizar();            // a mano («Sincronizar ahora»); no lanza: {ok, error, subidas, paqueteNuevo, avisosNuevos}
await sync.registrarSinRespuesta(texto, estacion);   // tras una abstención
await sync.paqueteGuardado();        // paquete descargado activo, o null
await sync.volverAtras();            // {ok, version}; la versión descartada no se vuelve a bajar sola (una más nueva sí)
await sync.avisosVigentes({ estacion });             // los vencidos no salen
await sync.estadoSync();             // {texto: «Última sincronización: 26 nov, 10:20», versionActual, versionAnterior, pendientes, ultimoError, …}
await sync.exportarCola({ vaciar }); // plan USB: {nombre, texto, blob}; mismo formato que el cuerpo de POST /sin-respuesta
await sync.importarPaquete(archivo); // plan USB: File/Blob/texto de fray-paquete-usb.json → {ok, version} o {ok: false, motivo}
```
Reintentos: tras una sincronización correcta, cada `intervaloMin`; tras un fallo, 1, 2, 4… min hasta `maxMin`; con el evento
`online`, de inmediato. Si `navigator.onLine === false`, no intenta. Se rechaza todo paquete cuya firma o sha256 no valide, o cuya
versión no sea mayor que la instalada. Guarda en IndexedDB (`fray-sync`): versión actual, anterior, avisos, cola y estado.

### 5.5 Integración en la interfaz (lo conecta el coordinador)
1. **Al arrancar:** `const p = (await sync.paqueteGuardado()) ?? paqueteIncluido; await fray.cargar(p);` y luego
   `sync.iniciarSync({ urlBase: config.urlBase /* null en la demo */, clavePublicaJwk /* contenido/clave_publica.json */,
   versionLocal: paqueteIncluido.version, alPaqueteNuevo: (p) => fray.cargar(p), alAvisos: mostrarBanner })`.
2. **Tras cada respuesta:** si `r.tipo === 'abstencion'`, `sync.registrarSinRespuesta(texto, estacion)`.
3. **Banner de avisos vigentes** en la pantalla de la estación: `sync.avisosVigentes({ estacion })`; cada aviso tal cual, con su
   hora (`vigenteDesde`–`vigenteHasta`) y `emitidoPor`. Se vuelve a pedir al cambiar de estación y cada minuto (así los vencidos
   desaparecen solos).
4. **Panel del parque:** «Última sincronización: …» (`estadoSync().texto`, con versión actual, anterior y preguntas pendientes) y
   botones «Sincronizar ahora», «Volver a la versión anterior», «Exportar preguntas (USB)» e «Importar paquete (USB)». En la base,
   la **bandeja** (`GET {urlBase}/bandeja`) lista las preguntas agrupadas con su conteo y un botón **«Crear ficha desde esta
   pregunta»** que abre el formulario de ficha con `estacion` y la pregunta en `preguntas` prellenadas; el personal escribe el
   texto citando guion y página, valida y publica con `firmar_paquete.py`.

### 5.6 Operación en la base (wifi local sin internet)
Un PC o una Raspberry Pi en la oficina de Brisas, con un router o punto de acceso wifi **sin internet** (p. ej. la Pi como AP en
`192.168.4.1`):
```bash
# una vez: venv FUERA del repo con cryptography (solo para firmar; el servidor no necesita nada)
python -m venv ~/fray-venv && ~/fray-venv/bin/pip install cryptography        # Windows: fray-venv\Scripts\pip
# publicar (la primera vez genera el par de claves; la privada queda fuera del repo)
python -X utf8 herramientas/firmar_paquete.py --paquete contenido/paquete.json --avisos avisos.json
# servir a los dispositivos
python -X utf8 servidor/sync_base.py --publicado publicado --datos datos --puerto 8090 --origen http://192.168.4.1:8000
```
Los dispositivos se configuran con `urlBase = http://192.168.4.1:8090`. Para que arranque solo en la Pi, un servicio systemd con el
último comando. Sin wifi en la base: `publicado/fray-paquete-usb.json` en una memoria USB → «Importar paquete»; y «Exportar
preguntas» → `curl -X POST -H "Content-Type: application/json" --data-binary @fray-sin-respuesta-2026-11-26.json
http://127.0.0.1:8090/sin-respuesta`.

**Opcional, solo documentado (no implementado):** equivalente en Vercel con funciones (`/api/sin-respuesta`, `/api/bandeja`),
almacenamiento (Blob o KV) para lo publicado y la bandeja, y **protección de acceso** del despliegue (repo privado; el contenido
oficial no se publica abierto, ver `.vercelignore`). La firma se sigue haciendo en el PC de la base: la nube solo guarda y sirve.

### 5.7 Prueba
`node pruebas/test_sync.mjs` (Node ≥ 20 y Python con `cryptography`): publica v1 → el cliente sincroniza → sube 3 preguntas →
salen agrupadas en `/bandeja` → v2 con una ficha nueva se descarga y verifica → firma alterada, versión cambiada y paquete alterado
se rechazan → volver atrás → aviso vencido oculto → plan USB. Todo en una carpeta temporal y en `127.0.0.1`.

## 6. Avisos del día (`avisos.json`, firmado con el paquete)
```jsonc
[
  { "id": "2026-11-26-salida",
    "texto": "Hoy el grupo de la mañana se reúne en la oficina de Brisas.",   // máx. 280 caracteres
    "tipo": "operativo",                              // único tipo permitido
    "emitidoPor": "Coordinación de guías, Brisas",    // el cargo, nunca el nombre de una persona
    "vigenteDesde": "2026-11-26T06:00:00-05:00",      // ISO 8601 con zona horaria
    "vigenteHasta": "2026-11-26T18:00:00-05:00",
    "estaciones": null }                              // o ["lunares", …]
]
```
- Se muestran **tal cual**, con su hora y quién lo emite; los vencidos se ocultan solos. No pasan por la búsqueda ni por el modelo.
  Ejemplo: `contenido/avisos.ejemplo.json`.
- **Nunca avisos sobre el estado o la alerta del volcán ni de salud** (volcán, cráter, ceniza, sismo, SGC, alerta, síntomas,
  médico, medicamentos, mal de altura, evacuación, emergencia…). `firmar_paquete.py` los rechaza y `sync.js` los descarta aunque
  vengan firmados (la misma lista en los dos). Esas preguntas siguen en el carril crítico, que remite al personal. Un canal
  oficial para ese tipo de aviso es una **propuesta futura para validar con UTON** (roadmap), no implementada.
