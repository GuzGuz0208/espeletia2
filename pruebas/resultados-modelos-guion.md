# ¿Cómo responde de verdad el modelo? Qwen3.5-0.8B vs Qwen2.5-1.5B vs Qwen3.5-2B con el guion (26-nov, PC)

**Qué se midió (MEDIDO):** las 31 preguntas de tipo `respuesta` (28) y `conflicto` (3) de `contenido/preguntas_desarrollo.json`
(banco de desarrollo, no ciego), con el **motor real** (`herramientas/fray_py.py`, paquete 2026-11-26.3, 154 fichas) eligiendo la
ficha y la frase, **exactamente el `r` que recibiría el generador en la app** (`pruebas/respuestas_motor.json`). Luego
`js/generador.js` (el mismo código de la app: prompt fijo, `temperature 0`, `max_tokens 70`, contexto = `r.breve`) contra
llama-server, y las **reglas finales** del verificador + el **respaldo frase a frase** (re-aplicadas a todas las respuestas
guardadas con el mismo código, para que los tres modelos se juzguen igual).

- **PC:** Intel i5-10300H, 4 hilos (`-t 4`), solo CPU, llama.cpp b12738, `-c 2048 -np 1`. Carga de la CPU medida antes de cada
  modelo: 3-6 % sin servidor, 0-12 % con el servidor en reposo (sin otras cargas pesadas; el PC sí tenía VS Code y navegadores abiertos).
- **Conflictos:** el motor devolvió `conflicto` en 2 de 3 (Kumanday y especies en Colombia): **por contrato no se generan** (la UI
  muestra las dos versiones con su página). La tercera (muertos en Armero) salió como `respuesta` y sí pasó por el modelo.
- **Juicio de calidad = del AGENTE** (lectura de cada respuesta contra el texto del guion, con motivo). Debe confirmarlo una persona.
- Crudos: `pruebas/resultados/modelos-guion-<modelo>.json` (cada respuesta, fallas y tiempos) y `pruebas/resultados/bench-pc-<modelo>.txt`.

## Resultado

| | **Qwen3.5-0.8B** | Qwen2.5-1.5B | **Qwen3.5-2B** |
|---|---|---|---|
| Tamaño GGUF Q4_K_M | 0,53 GB | 1,12 GB | 1,28 GB |
| llama-bench PC: leer prompt pp64 / pp256 (t/s) | 192 / 175 | 109 / 105 | 89 / 76 |
| llama-bench PC: **generar tg48 (t/s)** | **33,8** | 23,9 | 13,5 |
| Primera palabra, mediana (PC) | **0,48 s** | 0,97 s | 1,15 s |
| Respuesta completa, mediana / p90 (PC) | **1,5 s / 2,0 s** | 2,5 s / 3,6 s | 3,3 s / 5,4 s |
| Generadas (motor dio `respuesta`) | 28 | 28 | 28 |
| Pasan verificador + respaldo (el visitante ve la reescritura) | 21 | 20 | 21 |
| …de esas, **correctas y útiles** (agente) | **16** | 13 | **16** |
| …no responden pero no son falsas (agente) | 2 | 1 | 2 |
| …**errores que el visitante vería** (agente) | 3 | **6** | 3 |
| Bloqueadas por verificador/respaldo | 4 (4 inventos reales) | 4 (3 reales, 1 falso rechazo) | 2 (1 real, 1 rechazo prudente) |
| El modelo se abstuvo (queda el guion) | 3 | 4 | 5 |
| **Lo que ve el visitante es correcto** (reescritura buena o texto del guion) | **25/28** | 22/28 | **25/28** |

Cuando se bloquea o se abstiene, el visitante ve el **texto del guion** (siempre correcto y con cita): el modelo nunca tiene la última palabra.

**Errores que pasaron (los vería el visitante):**
- Qwen3.5-0.8B: «el parque alberga más de 100 especies de frailejones» (son en el mundo; en el parque, una); «no podemos subir porque la
  vida no puede colonizar la roca» (el guion dice que lucha por colonizarla y omite la actividad del volcán); frailejón «protege sus
  hojas de la luz y el calor» (confuso).
- Qwen2.5-1.5B: «hay más de 100 especies de frailejones en el parque»; **«hay venados de cola blanca en el páramo»** (el guion dice que
  desaparecieron); **«la nieve que hay debajo de la ceniza es hielo»** (el guion dice que eso es un mito que no se debe repetir);
  «Valle Lunar… llamado así por su fuerza física del clima»; superpáramo confuso; «más de 3 millones» (el guion: «cerca de»).
- Qwen3.5-2B: «más de 100 especies en Colombia, cerca de 60 en el parque» (al revés); «las fracturas se explican por la humedad
  ambiental» (el guion: gelifracción); superpáramo «es el límite inferior de las nieves» (el guion: llega hasta).
- **Patrón común:** «más de 100 especies» pasa en los tres: la cifra está en la frase del guion, pero aplicada a otro sujeto. El
  verificador no entiende de qué habla cada cifra. Mitigación ya en el código: `reescribir()` devuelve `respaldo` con la frase literal
  del guion para mostrarla debajo; y conviene que el contenido parta esa frase (cada cifra en su propia frase).

**Inventos atrapados:** «las rocas las dejó el volcán» (el guion: «no fueron arrojadas por el volcán»; atrapado por la regla de
negación), «la nieve está debajo, no es hielo» (dos modelos), «el esquí no se esquía porque…», «Aguacerales es el nombre del agua
que cae», «estamos a 3.000 metros» (cifra inventada). Falso rechazo: «Por la caída constante de agua…» (correcto; «constante» por
«no para» disparó la regla de negación). Rechazo prudente: Qwen3.5-2B copió el párrafo del guion sobre no decir que el volcán está
«apagado» y la regla de estado del volcán lo bloqueó (queda el guion, que dice lo mismo).

## 5 ejemplos lado a lado (pregunta → texto del guion que eligió el motor → reescritura)

**1. ¿Por qué se fracturan las rocas en Lunares?** (NORTE p. 6)
- Guion: «El paisaje aquí se torna 'lunar' debido a la gelifracción. El agua se filtra en las grietas de la roca, se congela por la noche aumentando su volumen y las estalla desde adentro: actúa como una cuña que rompe las rocas andesíticas en pedazos angulares.»
- 0,8B (1,7 s): «Las rocas se fracturan en Lunares por la gelifracción y el agua que se congela en las grietas, creando una cuña que rompe las rocas angulares.» ✔
- 1,5B (4,0 s): «Por la gelifracción, donde el agua se filtra en las grietas de la roca y se congela por la noche, aumentando su volumen y estalla desde adentro, rompiendo las rocas andesíticas en pedazos angulares.» ✔
- 2B (4,9 s): «Las rocas en Lunares se fracturan porque el agua filtra en sus grietas, se congela por la noche y actúa como una cuña que rompe las rocas andesíticas en pedazos angulares.» ✔

**2. ¿Esas rocas enormes las tiró el volcán?** (UTON 2024 p. 7)
- Guion: «Hay unas rocas enormes detrás de la cabaña cerca a la quebrada; estas rocas no fueron arrojadas por el volcán, estas fueron dejadas allá por el retroceso glaciar.»
- 0,8B: «Sí, esas rocas enormes son las que dejaron el volcán tras el retroceso glaciar.» ✘ **bloqueada** (pierde la negación) → el visitante ve el guion.
- 1,5B y 2B: se abstuvieron → el visitante ve el guion.

**3. ¿Qué especie de frailejón hay en el parque?** (UTON 2024 pp. 5-6)
- Guion: «Existen más de 100 especies de frailejones, en Colombia se tienen cerca de 60 de estas especies y para el PNNN se encuentra reportada únicamente la especie de Frailejón Espeletia hartwegiana.»
- 0,8B: «El parque alberga más de 100 especies de frailejones, con cerca de 60 en Colombia y la única especie reportada por el PNNN es Frailejón Espeletia hartwegiana.» ✘ pasa (error)
- 1,5B: «Hay más de 100 especies de frailejones en el parque.» ✘ pasa (error)
- 2B: «Existen más de 100 especies de frailejones en Colombia, cerca de 60 en el parque y solo la especie de Frailejón Espeletia hartwegiana en el PNNN.» ✘ pasa (error)

**4. ¿Quién fue Juan Díaz Jaramillo?** (UTON 2024 p. 35, relato)
- Guion: «Juan Díaz Jaramillo fue un español que, proveniente del Ecuador, decidió asentarse en Tocaima, persiguiendo el rastro del oro indígena durante la segunda mitad del siglo XVI.»
- 0,8B y 2B: «Según la tradición oral, Juan Díaz Jaramillo fue un español que, proveniente del Ecuador, decidió asentarse en Tocaima…» ✔ (copia con la etiqueta de relato, que pone el código, no el modelo)
- 1,5B: «Según la tradición oral, Juan Díaz Jaramillo fue un español que asentó en Tocaima en la segunda mitad del siglo XVI, buscando el oro indígena.» ✔

**5. ¿Qué animales grandes hay en el parque?** (UTON 2024 pp. 42-43)
- Guion: «Los grandes mamíferos son altamente vulnerables a la extinción… por lo cual han desaparecido de muchos páramos, como es el caso del venado de cola blanca (Odocoileus virginianus) en el PNN Los Nevados.»
- 0,8B (2,7 s): copia casi literal, pero quita «han desaparecido de muchos páramos» ✔ (útil a medias)
- 1,5B: «Hay venados de cola blanca en el páramo.» ✘ **pasa y es falso** (el guion dice que desaparecieron)
- 2B (5,5 s): «Los grandes mamíferos en el parque son altamente vulnerables… por lo que han desaparecido de muchos páramos, como el venado de cola blanca en el PNN Los Nevados.» ✔

## Recomendación
**Celular de gama media → Qwen3.5-0.8B Q4_K_M (0,53 GB).**
- Velocidad: el leaderboard de PocketPal (referencia PUBLICADA, ver docs/ficha-una-pagina.md) da **12,5 t/s de generación y
  103 t/s de prefill** en un Redmi Note 15 Pro 5G con este mismo modelo, solo CPU: cumple ≥10 t/s. ESTIMADO con la relación
  PC/teléfono de ese dato (2,7× en generación, 1,9× en prefill): **~1 s a la primera palabra y ~3,5-4 s la respuesta completa**
  (si el puente nativo no cachea el prompt del sistema, sumar ~1 s).
- Calidad: empata con Qwen3.5-2B en lo que ve el visitante (25/28) y el verificador atrapó sus 4 inventos; tiende a copiar el guion
  (menos «tono de guía», más fiel).

**Celular de gama alta → Qwen3.5-2B Q4_K_M (1,28 GB).** Redacción más natural y menos cambios de sentido, pero 2,5× más lento que el
0,8B en el PC (13,5 vs 33,8 t/s). ESTIMADO en gama media: ~5 t/s y ~8 s por respuesta (no cumple); en gama alta (≈2× la media,
SUPUESTO) ~10 t/s y ~4 s.

**Qwen2.5-1.5B: no recomendado.** Es el que más errores deja pasar (6, dos graves: venados y «la nieve debajo es hielo»).

## Pendiente
- Medir en el celular real (APK con llamadart): t/s, primera palabra y total con `prueba-llm-nativo.md` del repo anterior.
- **La APK actual rechaza todas las fichas nuevas:** su `critico.dart` falla cerrado si la ficha no está en el `chat.json` viejo.
  Hay que recompilarla con el catálogo del paquete nuevo (o pasarle `fichaId` vacío y dejar el carril en la PWA).
- Que una persona confirme el juicio de calidad.
