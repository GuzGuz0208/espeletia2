# Generador local: calidad, tiempos y respaldo frase a frase (26-nov, PC)

Comparación final de modelos con el motor real: **[resultados-modelos-guion.md](resultados-modelos-guion.md)**. Aquí, lo demás.

## 1. Finalistas con la ficha correcta como contexto (MEDIDO)
`node herramientas/evaluar_generador.mjs --paquete contenido/paquete.json --preguntas contenido/preguntas_desarrollo.json --n 20
--contexto breve|ficha` — 20 preguntas `respuesta` del banco de desarrollo con la ficha esperada + 4 trampas (pregunta que la ficha
no responde). Verificador de cifras y nombres (sin el respaldo frase a frase, que vino después). PC i5-10300H, 4 hilos; carga de la
CPU al empezar 13-56 % por otros procesos del equipo: tiempos orientativos.

| Modelo | Contexto | Pasan verificador | Se abstuvo | Trampas bloqueadas | 1.ª palabra (mediana) | Total (mediana) |
|---|---|---|---|---|---|---|
| Qwen3.5-2B | breve | 16/20 | 4 | 4/4 | 1,2 s | 3,2 s |
| Qwen3.5-2B | ficha | 17/20 | 3 | 4/4 | 2,4 s | 5,3 s |
| Qwen2.5-1.5B | breve | 17/20 | 3 | 4/4 | 0,8 s | 2,1 s |
| Qwen2.5-1.5B | ficha | 18/20 | 2 | 3/4 | 2,8 s | 4,7 s |

- **Contexto `breve`** (la frase que elige el motor) es ~2× más rápido que la ficha completa y casi igual de bueno; la ficha ayuda
  cuando la frase no trae el dato (p. ej. «pelitos blancos»). La app usa `breve` (por defecto en `reescribir`).
- Trampas: todos los inventos con cifras («el cóndor pesa 15-20 kg», «15 °C», «1.500 gramos») los bloqueó el verificador.
- Lectura de respuestas (agente): pasar el verificador no basta; hubo cambios de sentido sin cifras nuevas. De ahí el respaldo.

## 2. Respaldo frase a frase (anti-alucinación)
Cada frase generada debe apoyarse en **una** frase del texto de la ficha: con e5 si el motor lo expone (`configurar({ embeber })`,
umbral `UMBRAL_E5` = 0,85, **PENDIENTE de calibrar**), si no, léxico (fracción de palabras con contenido presentes en una sola frase
fuente; las palabras de la pregunta no cuentan). Además: cada cifra debe estar en su frase de respaldo (o en la pregunta), no puede
perder su cuantificador («3 de los 6 glaciares» → «6 glaciares» se bloquea), y la **polaridad** debe coincidir (negación perdida o
añadida). `reescribir()` devuelve `respaldo: [{frase, fraseFuente, sim}]` para mostrar la frase literal del guion debajo.

Calibración (`node herramientas/calibrar_respaldo.mjs`) con `pruebas/casos_respaldo.json`: 68 respuestas reales que **ya pasaban** el
verificador de cifras (57 correctas y 11 con error, etiquetadas por el agente) + 8 sintéticas (4 correctas y 4 errores, incluye «llegarán a 6 glaciares»):

| Umbral léxico | Correctas descartadas (falsos rechazos) | Errores atrapados |
|---|---|---|
| 0,40 | 10/61 (16 %) | 7/15 |
| **0,50 (elegido)** | **14/61 (23 %)** | **10/15** |
| 0,60 | 20/61 (33 %) | 12/15 |

Un falso rechazo solo cuesta tono (el visitante ve el texto del guion, que es correcto); un error que pasa cuesta fidelidad. Con el
motor real (resultados-modelos-guion.md) las reglas nuevas atraparon «las rocas las dejó el volcán», «la nieve está debajo, no es
hielo» y «el esquí no se esquía porque…», con 1 falso rechazo en 84 respuestas. **No atrapa** una cifra real aplicada a otro sujeto
(«más de 100 especies en el parque»).

## 3. Velocidad en el PC (MEDIDO, llama-bench b12738, 4 hilos, CPU con 3-6 % de carga previa)
| Modelo | pp64 | pp256 | tg48 |
|---|---|---|---|
| Qwen3.5-0.8B | 192 t/s | 175 t/s | 33,8 t/s |
| Qwen2.5-1.5B | 109 t/s | 105 t/s | 23,9 t/s |
| Qwen3.5-2B | 89 t/s | 76 t/s | 13,5 t/s |

`herramientas/bench_dispositivo.ps1` en el mismo PC (Qwen2.5-1.5B, con otras cargas): pp64 65, pp256 94, tg48 16 t/s; 5 preguntas de
extremo a extremo con 0,6-1,2 s a la primera palabra y 1,5-3,6 s en total; CPU media de llama-server 49 % del equipo
(`pruebas/bench-DESKTOP-MVJPMI1-20261126-1027.txt`). En el celular: PENDIENTE.

## Cómo reproducir
```bash
python -X utf8 herramientas/respuestas_motor.py                 # r del motor real → pruebas/respuestas_motor.json
powershell -File servidor/iniciar.ps1 -Modelo q35-0.8b         # o bash servidor/iniciar.sh q35-0.8b (ver servidor/LEEME.md)
node herramientas/evaluar_generador.mjs --paquete contenido/paquete.json --respuestas pruebas/respuestas_motor.json --salida out.json
node herramientas/calibrar_respaldo.mjs --detalle 0.5
node pruebas/verificador.test.mjs
```
