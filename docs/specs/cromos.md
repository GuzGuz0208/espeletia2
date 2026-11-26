# Spec · Cromos y apertura de sobres (Eduardo)

Estado: listo para empezar · 26-nov-2026 · Dueño: Eduardo · Rama: `eduardo/cromos`

## Por qué
El reto no puntúa la gamificación, pero el cromo es la **recompensa por detenerse en la estación y preguntar** (claridad para
visitantes y demostración, 20 puntos). Además sirve para el pitch y el roadmap (Álbum del Páramo). Debe sumar, nunca estorbar:
**nada de mirar el teléfono caminando**; el sobre se abre en la estación.

## Qué construir
1. **`cromos.html` (página sandbox)**: prueba las animaciones sola, sin depender del motor ni de la interfaz principal.
2. **`js/cromos.js`**: estado de cromos (IndexedDB o localStorage, con try/catch) y API:
   ```js
   import { abrirSobre, ganados, total } from './js/cromos.js';
   await abrirSobre('aguacerales-frailejon');   // muestra sobre → cromo, lo guarda; si ya lo tiene, «Ya lo tienes»
   ganados();   // ['brisas-agua', ...]
   ```
   Escucha el evento global para integrarse sin tocar la interfaz de otros:
   ```js
   document.addEventListener('fray:cromo', e => abrirSobre(e.detail.id));
   // La interfaz del visitante lo dispara al validar el QR de la estación o tras la primera pregunta respondida en ella.
   ```
3. **`js/sobre.js` + `css/cromos.css`**: la animación (sobre cerrado → deslizar o tocar → cromo con sello de estación y altitud →
   «Pegar»). Parte del legado (`legado/album/js/sobre.js`, `cromo.js`, `celebrar.js`, `art.js`, `styles.css`); cópialo y simplifícalo,
   no lo importes desde `legado/`.
4. **Reverso del cromo**: el dato **literal del guion** y la cita visible («Guion Ecoturístico UTON 2024 · p. 5»). Etiqueta «Relato de
   tradición oral» si `tipo === 'relato'`.

## Datos
- `contenido/cromos.json` (en esta rama): 10 cromos con dato literal y cita. **No inventes datos**; si cambias un texto, que siga
  siendo literal del guion y con su página. Los 24 cromos del álbum anterior (`legado/album/cromos-album.json`) son solo referencia:
  sus datos no salen de los guiones.
- Ilustraciones: las de `legado/album/js/art.js` (SVG en código, propias del equipo) o nuevas.

## Criterios de aceptación
- Cuando se dispara `fray:cromo` con un id válido, entonces se abre el sobre y el cromo queda guardado (sobrevive a recargar).
- Cuando el cromo ya está, entonces dice «Ya lo tienes» y no repite la animación completa.
- Cuando el sistema pide menos movimiento (`prefers-reduced-motion`), entonces la apertura es un fundido simple.
- Funciona sin red, con letra grande, en una pantalla de 360 px de ancho y con un toque (guantes).
- Sin sonido por defecto (el parque prohíbe ruidos que perturben).

## Integración
- No edites `index.html` ni `js/ui.js` (los hace la rama `agente/interfaz`); solo publica tu módulo y el evento. Para conectarlo
  basta un `<script type="module" src="js/cromos.js">` que se pide en el PR.
- PR contra `main` pequeño y pronto (aunque sea solo la animación), luego mejoras.
