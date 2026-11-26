## La Lente reconoce la loricaria y distingue mejor el pajonal

`models/parque.json` pasa de 703 a 800 huellas con fotos del páramo andino: observaciones de iNaturalist con grado de
investigación de Colombia, Ecuador y Perú, revisadas una por una. Se quitaron polillas del género homónimo *Loricaria*,
fotos con manos, solo cielo o una sola espiga.

- **Clase nueva: loricaria** («cacho de venado», «coral de páramo»), 68 fotos. Cromo nuevo en Flora y paisaje con el
  texto literal del guion UTON 2024, p. 9 (el de `contenido/cromos.json → lunares-loricaria`). El álbum pasa a 26 cromos.
- **Pajonal**: 29 fotos más de *Calamagrostis* (83 en total).
- Se probaron valeriana y romero de páramo y se descartaron. La valeriana de Colombia en iNaturalist es sobre todo de
  bosque, y el romero se confundía con el siete cueros: bajaba de 80 % a 70 % lo que la Lente responde.
- La cabeza se recalibró dejando fuera **todas las fotos del mismo autor**, no solo la foto. Umbral 0,61.

| Medida | Antes | Ahora |
|---|---|---|
| Acierta cuando responde | 90 % | 90 % |
| Responde | 80 % | 78 % |
| Pajonal: responde / acierta | 56 % / 60 % | 61 % / 71 % |
| Loricaria: responde / acierta | — | 81 % / 95 % |
| «Otra cosa» da cromo | 6 % | 5 % |

Comprobado en la app con fotos reales del páramo que no están en la base (las de los cromos): frailejón 92 %,
loricaria 97 %, roca 94 % y nevado 97 %; la entrada de Brisas da «No estoy seguro», como debe. Las escenas que mezclan
pajonal con frailejones o con una laguna suelen salir como pajonal (igual que antes).

Créditos: `licencias/lente-ampliacion-2026-11b.md` (varias fotos son CC BY-NC: sirven para la prueba, no para uso comercial).
