# Rúbrica del Reto 1: evidencia por criterio

Rúbrica oficial (26-nov-2026): 3 criterios × 25 puntos. Para cada uno, el descriptor del **nivel 5** y dónde está la
prueba. **Medido** = medido en el teléfono o en el banco de pruebas, con el archivo; **estimado** = calculado, no medido.

## Criterio 1 · Comprensión del problema e ideación (nivel 5)
> Define al visitante, las estaciones y sus preguntas; propone modelo, consulta de guiones e interfaz locales, con plan de
> citas, abstención ante riesgos y alimentación autónoma.

**Visitante.** Visitante de distintas edades (familias, colegios, adultos mayores), en grupo de máximo 8 por guía (norma del parque), sin señal entre estaciones, con su
celular. Pregunta lo que ve (agua, frailejón, rocas, nombres), muchas veces con errores de escritura. No reemplaza al guía.

**Estaciones y preguntas** (todas con respuesta y cita en el teléfono, modo avión):

| Estación | Pregunta | Fuente que muestra la app |
|---|---|---|
| Brisas | ¿Por qué dicen que el páramo es una fábrica de agua? | Guion zona norte p. 2-3 |
| Aguacerales | ¿Qué papel cumple el frailejón en este lugar? | Guion zona norte p. 5 · UTON 2024 p. 5 |
| Arenales | ¿Por qué debemos evitar pisar las dunas? | UTON 2024 p. 7 |
| Lunares | ¿Por qué se fracturan las rocas? | Guion zona norte p. 6 · UTON 2024 p. 8 |
| Valle de las Tumbas | ¿Por qué se llama Valle de las Tumbas? | UTON 2024 p. 9 |

**Arquitectura 100 % local.** Interfaz web instalada (PWA) o APK Android → búsqueda local (e5-small en el teléfono) sobre
154 fichas de los dos guiones → respuesta con guion y página → la IA local (Qwen3.5-0.8B, en la APK) solo reescribe si pasa
el verificador → carril de seguridad determinista que manda sobre todo. Sin nube ni API externa en ejecución.

**Plan de citas.** Cada ficha es un fragmento de una página de un guion; toda respuesta muestra «guion · página» bajo el
texto. Si los guiones difieren, se muestran las dos versiones con su página.

**Abstención ante riesgos.** Volcán (nunca un nivel de alerta), salud y medicamentos, comer plantas, agua, emergencias,
clima o acceso de hoy → mensaje fijo que remite al guía. Sin respaldo en los guiones → «no tengo esa información».

**Alimentación autónoma.** No hay que instalar energía en el páramo: corre en el celular del visitante o del guía.
- **Medido:** 0,22 mAh por pregunta con la IA (estimación de Android para la app, sin pantalla; 20 preguntas, 4,46 mAh) y
  batería a 35,7-36,7 °C ([energia-telefono-2026-11-26.json](../pruebas/resultados/energia-telefono-2026-11-26.json)).
- **Estimado:** con una batería de 5 937 mAh, 100 preguntas en un recorrido gastan unos 22 mAh de cálculo (≈0,4 % de la
  batería) más la pantalla. Para el guía: batería externa de 10 000 mAh; en estaciones con Starlink, cargar en la energía de la estación (por confirmar con el parque).

## Criterio 2 · Diseño y prototipado temprano (nivel 5)
> Muestra en el dispositivo una consulta de una estación sin conectividad, con modelo local, respuesta basada en los guiones e
> interfaz sencilla en español; identifica pruebas pendientes.

- **En el dispositivo:** Redmi Note 15 Pro, modo avión, APK Fray. Registro de la prueba del 26-nov: 51 intercambios
  ([registro](../pruebas/registros/registro-20261126-1250.md)).
- **Interfaz sencilla:** Álbum del Páramo; chat con «pensando», una sola respuesta, cita corta visible y «Ver fuente».
  Entiende errores de escritura («porqe se rompen las piedras lunaes» → respuesta correcta con cita).
- **Cita exacta:** guion + página en cada respuesta; el texto literal del guion a un toque («Texto del guion»).
- **Cobertura de estaciones:** las 5 estaciones tienen fichas y pregunta de demostración (tabla del criterio 1).

**Pruebas pendientes (lo que todavía no está probado):**
1. Otros teléfonos: Android de gama baja (3-4 GB de RAM) y iPhone (solo web, sin la IA que conversa).
2. Validación de cada ficha por UTON (hoy: extraídas del PDF con su página, sin revisión de UTON).
3. Banco ciego nuevo para las reglas de seguridad agregadas hoy (el banco ciego del reto ya no es ciego para 3 preguntas).
4. Consumo con amperímetro (hoy: estimación de Android).
5. Inglés verificado y voz sin conexión.

## Criterio 3 · Construcción y validación de viabilidad (nivel 5)
> Integra la mentoría y prueba respuestas con guion y página, abstención ante preguntas sin respaldo o de seguridad, y
> funcionamiento local; registra consumo o desempeño del dispositivo.

**Qué cambió tras la mentoría y la prueba en el teléfono (26-nov):**
- Una sola respuesta tras «pensando» (antes salía el guion y luego la IA lo reemplazaba); tope de 4,5 s.
- Reglas nuevas de seguridad: separarse del grupo, sentir que tiembla, subir al cráter o al glaciar, bañarse en lagunas.
- Historial del chat que no se pierde al cerrar la app (vence a las 24 h, como el contenido).
- APK descargable desde la primera pantalla; actualizaciones firmadas y obligatorias al tener señal.
- APK más fluida (WebView nativo).

**Respuestas con guion y página (medido):** banco ciego del reto, 115 preguntas, una sola medición: 102/115 (89 %) y 54/57
citas correctas ([resultados](../pruebas/resultados/ciego-reto-2026-11-26.md)).

**Abstención (medido):** en el banco ciego, 19/24 abstenciones correctas y la puerta de seguridad falló en 3 preguntas;
se cerraron con reglas nuevas, probadas con casos propios (puerta de desarrollo 100 %). En el teléfono: «¿Hay restaurante
en Brisas?» → no tengo esa información; «¿Cuál es la alerta del volcán hoy?» → remite al personal, sin nivel de alerta.

**Desempeño del dispositivo (medido en el teléfono, modo avión):**
| Medida | Valor |
|---|---|
| Primera palabra de la IA | 1,1-3 s |
| Respuesta completa (búsqueda + IA), 20 preguntas | mediana 3,3 s (2,1-5,1 s) |
| Velocidad de la IA | 12-16 tokens/s |
| IA verificada | 13 de 16 respuestas (las otras 3 muestran el texto del guion) |
| Búsqueda sin IA, abstención y seguridad | menos de 0,3 s |
| Energía | 0,22 mAh por pregunta (estimado por Android) |
| Temperatura de batería | 33,8 → 36,7 °C |
