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
