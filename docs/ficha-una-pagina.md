# Fray · guía de páramo sin señal (ficha de una página)

Reto UTON «Guía de páramo sin señal» · 26-nov-2026. Asistente por estación (Brisas → Valle de las Tumbas) que funciona **100 %
sin conexión**, responde **solo con los dos guiones de UTON** citando guion y página, y **se abstiene y remite al guía** cuando no
hay respaldo, cuando los guiones difieren o cuando se pide información actual (volcán, clima, acceso, salud).

**Convención:** MEDIDO = lo medimos nosotros (fecha y equipo). PUBLICADO = cifra de terceros. PENDIENTE = falta medir.

## 1. Modelo y herramientas (todo local, licencias con uso comercial)
| Pieza | Qué hace | Licencia |
|---|---|---|
| multilingual-e5-small (int8, en el navegador con ONNX Runtime Web) | Encuentra la ficha y la frase del guion: respuesta extractiva al instante | MIT · MIT |
| Qwen3.5-2B o Qwen2.5-1.5B (GGUF Q4_K_M) en llama.cpp, servidor en 127.0.0.1 | Opcional: reescribe la frase en tono de guía | Apache-2.0 · MIT |
| Verificador determinista | Toda cifra y todo nombre deben estar en el guion; si falla o tarda, queda el texto del guion | propio |
| Carril crítico (reglas) | Volcán, salud, emergencia, comer o tocar, clima y acceso de hoy → personal del parque. Manda sobre todo, también sobre el guion | propio |
| App web estática offline + panel del parque + QR de estación firmados (jsQR, HMAC) | Interfaz del visitante y actualización sin código | Apache-2.0 (jsQR) |

**Por qué (MEDIDO 25-nov, PC i5-10300H, llama.cpp solo CPU, 25 preguntas del proyecto anterior, no de los guiones):** Qwen3.5-2B
23/25 correctas; Qwen2.5-1.5B 22/25; Gemma 3 1B 19/25 (afirmó un restaurante que no existe); Llama 3.2 1B 5/25. El verificador
atrapó todos los inventos de cifras en las trampas. El 24-nov, Qwen2.5-0.5B en el navegador dio 0-2 de 7 útiles y congeló un
teléfono: el modelo generativo nunca tiene la última palabra. PENDIENTE: repetir con los guiones y elegir modelo según el dispositivo.

## 2. Consumo medido
| Estado | Potencia (W) | Cómo se mide |
|---|---|---|
| En espera, pantalla encendida | PENDIENTE: medido en el dispositivo | Medidor USB en línea con la alimentación, 5 min, promedio |
| Respondiendo (búsqueda + reescritura) | PENDIENTE: medido en el dispositivo | Ráfaga de 20 preguntas de la demo; energía total ÷ 20 = Wh por pregunta |
| Tiempo por respuesta | Extractiva: PENDIENTE · reescrita: PENDIENTE | Cronómetro de la app, mediana de 20 preguntas, en modo avión |

Referencia PUBLICADA (leaderboard de PocketPal): Redmi Note 15 Pro 5G con Qwen3.5-0.8B Q4, solo CPU, prefill 103 t/s y decode
12,5 t/s. Es un modelo más pequeño que nuestros finalistas, así que el nuestro irá más lento.

## 3. Costo estimado por estación
Detalle y supuestos en [energia.md](energia.md). Energía diaria = W en espera × horas de operación (supuesto: PENDIENTE confirmar con
UTON) + Wh por pregunta × preguntas al día (supuesto de UTON: PENDIENTE).
| Concepto | Valor |
|---|---|
| Energía por día | PENDIENTE (energia.md) |
| Panel solar + batería + controlador + caja para frío y humedad | PENDIENTE (energia.md) |
| Dispositivo | PENDIENTE (el entregado por la organización o equivalente) |
| Licencias de software y modelos | 0 (MIT y Apache-2.0) |
| **Total por estación** | **PENDIENTE (energia.md)** |

## 4. Cómo se actualiza el contenido (sin tocar código)
1. **Panel del parque con PIN:** el personal edita una ficha o importa fichas (formulario, CSV o JSON) con texto del guion, página y
   estado `validado` o `borrador`. Solo lo validado llega al visitante.
2. **Índice recalculado en el dispositivo** y **versión nueva con vuelta atrás** si algo sale mal.
3. **Registro de preguntas sin respuesta** en el dispositivo (sin datos personales): muestra qué fichas faltan.
4. **Sincronización en Brisas antes de subir**, donde empieza la inducción: arriba nadie cambia nada. Método de copia del paquete
   entre dispositivos: PENDIENTE.

## 5. Cómo se sostiene y se replica
- **Operador:** UTON mantiene el contenido con su personal; el equipo técnico solo interviene para cambiar la app o el modelo.
- **Otros parques y senderos:** la app no cambia; cambia el paquete de fichas (guion → fichas con página). Requiere autorización del
  dueño del contenido: el material del reto solo se usa para el reto.
- **Licencias:** todo el software y los modelos permiten uso comercial; costo de licencias cero.
- **Siguiente paso:** piloto con UTON en una estación ([roadmap.md](roadmap.md)).
