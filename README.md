# Fray · guía de páramo sin señal

Asistente de interpretación ambiental para las estaciones del sector norte del PNN Los Nevados (Brisas → Aguacerales → Arenales →
Lunares → Valle de las Tumbas). Funciona **100 % sin conexión** en el dispositivo del parque, responde **solo con los guiones
oficiales de UTON** citando guion y página, y **se abstiene y remite al guía** cuando no hay respaldo, cuando los guiones difieren o
cuando se necesita información actual (volcán, clima, acceso, salud).

Reto «Guía de páramo sin señal» · UTON / ACOPI Caldas / Universidad de Caldas · 26-nov-2026. Repo privado: el contenido oficial
solo se usa para el reto.

- Reglas: [AGENTS.md](AGENTS.md) · Contrato: [docs/contrato.md](docs/contrato.md) · Roles: [docs/roles.md](docs/roles.md)
- Cumplimiento del reto: [docs/cumplimiento.md](docs/cumplimiento.md) · Decisiones: [docs/decisiones/](docs/decisiones/README.md)
- Base de la que parte: [dsalazardev/espeletia-ai](https://github.com/dsalazardev/espeletia-ai) (Álbum del Páramo).

## Cómo correrlo
### Interfaz (visitante y Panel)
Servidor estático local (sin red): `python -m http.server 8000 --bind 127.0.0.1` y abrir `http://127.0.0.1:8000/`.
Tras la primera carga, `sw.js` deja todo guardado para modo avión. Con `?ia=demo` se ve la marca de reescritura con el
generador de ejemplo.

- `index.html` · pantalla del visitante: estación (o QR firmado) → pregunta → respuesta breve, «Ampliar» y cita.
- `panel.html` · Panel del parque: fichas, importar/exportar, preguntas sin respuesta, versiones y QR de estación.
  El PIN se define en el primer uso **en cada dispositivo** y solo se guarda su hash PBKDF2 en ese dispositivo.
  **En producción, `panel.html` no se instala en los kioscos de los visitantes**: el Panel se usa en el dispositivo del
  personal y el paquete se lleva a los kioscos exportado (USB, en Brisas antes de subir).
- Si aún no existen `js/fray.js` o `contenido/paquete.json`, la interfaz usa `js/fray-mock.js` y
  `ejemplo/paquete-ejemplo.json` y lo indica con una insignia «Motor de ejemplo · Paquete de ejemplo».

- **Vercel** (sitio estático, sin build): `vercel.json` pone `no-cache` a `index.html`, `panel.html`, `sw.js`, `manifest.json` y
  `contenido/`, `application/wasm` a los `.wasm`, caché inmutable a `models/partes/` y `X-Robots-Tag: noindex`. No hacen falta
  COOP/COEP: ONNX Runtime corre con 1 hilo (`numThreads = 1`), y con COEP el generador no podría hablar con 127.0.0.1:8080.
  `.vercelignore` deja fuera fuentes/, docs/, herramientas/, pruebas/, servidor/, legado/, qr/ y ejemplo/. El repo es privado y
  el despliegue debe ir **con protección de acceso** (el paquete lleva texto de los guiones).

### Motor
Motor (js/fray.js, contrato §2): `python -m http.server 8000 --bind 127.0.0.1` en la raíz y abrir
`http://127.0.0.1:8000/prueba-motor.html` (página mínima de prueba; la interfaz real es aparte). Todo es local: `lib/` (ONNX Runtime
web, tokenizers, jsQR, qrcode) y `models/` (e5-small podado int8 en partes con SHA-256).

| Comando | Qué hace |
|---|---|
| `python -X utf8 herramientas/evaluar.py` | Evalúa con `contenido/preguntas_desarrollo.json` (+ `pruebas/*.json`, nunca `pruebas/ciego*` salvo `--ciego`); **puerta de seguridad al 100 %** o sale con 1 |
| `python -X utf8 herramientas/evaluar.py --calibrar` | Recalibra umbrales SOLO con desarrollo → `models/fray-params.json` |
| `python -X utf8 herramientas/paridad.py [--regenerar]` | Carril/léxico/frases de JS (node) vs Python: diferencia 0. `--regenerar` rehace `herramientas/carril_py.py` desde `js/carril.js` |
| `python -X utf8 herramientas/fray_py.py --indice` | Escribe `contenido/indice.json` (vectores precalculados que siembran la caché del dispositivo). Rehazlo al cambiar el paquete |
| `python -X utf8 herramientas/qr_estaciones.py` | QR firmados de las 5 estaciones en `qr/` (clave de DEMOSTRACIÓN en `contenido/qr_clave_demo.json`) |
| `node herramientas/navegador.mjs "<url>?auto=1"` | Abre la página de prueba en Chrome sin interfaz (DevTools, solo 127.0.0.1) y mide tiempos |
