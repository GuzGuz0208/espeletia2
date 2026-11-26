## Sobre de cromos animado

El cromo ahora llega en un sobre: se abre con un toque, deslizando o con Enter, y sale con su ilustración, el sello de la
estación con su altitud y, debajo, el dato literal del guion con la cita visible. Los relatos llevan la etiqueta «Relato
de tradición oral». Sin sonido; con «menos movimiento» todo es un fundido. El botón «Pegar» queda fijo abajo, a la vista
en 360 px y con letra grande.

- `js/sobre-demo.js` (animación) y `js/cromos-arte.js` (ilustraciones), copiados y simplificados del Álbum del Páramo.
  Loricaria y Kumanday tienen dibujo nuevo.
- `css/cromos.css`: `js/cromos-demo.js` carga los estilos en la página de pruebas.
- El evento acepta también la estación: `fray:cromo` con `{ estacion }` da el siguiente cromo de esa estación, y
  el cóndor cuando ya tiene los de la estación. Así se pueden ganar los 10. Con `{ id }` sigue igual.
- Al pegar se emite `fray:cromo-pegado` con `{ id, total, de }`. Cerrar con Escape antes de pegar no guarda el cromo.
- El cromo de condensación incluye ahora la frase completa del guion: «(habitualmente ocurre en temporada seca)».
- **Fotos de exposición:** cada cromo es una copia fotográfica con passe-partout, la foto, el número, el nombre y el
  crédito del fotógrafo («© Autor · licencia»). La lámina de texto agrega «Foto: … · Wikimedia Commons». Son 10 fotos
  de Commons (CC BY y CC BY-SA) recortadas a 480 × 522 px, unos 590 KB en total, en `img/cromos/`, con créditos en
  `img/cromos/creditos.json` y `licencias/fotos-cromos.md`. Si falta una foto, se ve el dibujo.
- **Por descubrir:** el álbum (`abrirAlbum()` o el evento `fray:album`) muestra los 10 cromos. Los ganados, con su
  foto en papel; los que faltan, como un panel oscuro del color de su estación, con la misma foto en duotono de 3 tonos
  (filtro SVG local), destellos angulares, la franja clara inclinada y «Se gana en …». Colores: Brisas azul cielo,
  Aguacerales verde agua, Arenales ocre, Lunares rojo óxido, Tumbas violeta y el cóndor azul noche. Tocar uno ganado lo
  muestra en grande. El sobre deja ver, en duotono, el cromo que trae.
- `cromos.html`: página de pruebas local. La app principal usa el flujo del álbum integrado en `main`.

Spec [Cromos y apertura de sobres](../specs/cromos.md).
