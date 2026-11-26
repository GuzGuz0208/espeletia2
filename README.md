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
