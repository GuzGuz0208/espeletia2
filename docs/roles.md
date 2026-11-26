# Roles y reparto (26-nov-2026)

Dos personas, cada una con agentes de apoyo. Se trabaja en paralelo sobre el contrato de `docs/contrato.md`.

| | Juan (plataforma, modelo y seguridad) | Eduardo (producto e interfaz) |
|---|---|---|
| Dueño de | `contenido/`, `js/fray.js`, `js/generador.js`, `herramientas/`, `pruebas/`, `servidor/`, `docs/` | `index.html`, `styles.css`, `js/ui*.js`, `js/panel*.js`, `js/qr*.js`, `icons/` |
| Entrega | Paquete de los guiones con páginas · motor de búsqueda + carril crítico · LLM local en el dispositivo · verificador · evaluaciones · energía · ficha de 1 página y pitch | Pantalla del visitante (estación → pregunta → breve + «ampliar» + cita) · Panel del parque (editar/importar fichas, preguntas sin respuesta, versión) · QR de estación · accesibilidad · guion de la demo |
| Agentes | contenido, motor, modelo en el dispositivo, pruebas ciegas, pitch | (opcional) revisión de interfaz |

## Sprints (horas aproximadas)
1. **Diseño (hasta ~10:30):** contrato fijo, paquete v0 de los guiones, maqueta de pantallas. Specs del dispositivo (10:20).
2. **Implementación (10:30-13:00):** motor + interfaz conectados con el paquete real; LLM corriendo en el dispositivo.
3. **Límites y prueba local (13:00-14:30):** carril crítico, abstención, conflictos, banco ciego, modo avión en el dispositivo.
4. **Medición y pitch (14:30-fin):** consumo medido, ficha de 1 página, ensayo del pitch de 3 minutos.

## Puntos de choque
- `contenido/paquete.json`: lo genera el pipeline; el Panel lo modifica en el dispositivo (no en el repo).
- `index.html`: Eduardo. Si el motor necesita un `<script>`, lo pide en el PR.
