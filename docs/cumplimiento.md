# ¿Cumplimos el reto? (revisión del 26-nov-2026, 9:30)

Fuentes: ficha técnica complementada (pp. 1-3), presentación del reto (26 diapositivas) y transcripción de la explicación.

| # | Requisito (ficha técnica) | Lo que traíamos (Álbum del Páramo) | Lo que falta hoy | Dueño |
|---|---|---|---|---|
| 1 | 100 % sin conexión, **con un modelo de lenguaje local en el dispositivo entregado** | PWA offline; e5-small (modelo de lenguaje de recuperación) en el navegador; LLM generativo medido en PC: Qwen3.5-2B 23/25 y Qwen2.5-1.5B 22/25 | Correrlo **en el dispositivo de la organización** (specs a las 10:20); servidor local llama.cpp o APK Flutter | Juan |
| 2 | Responder con los **dos guiones**, citando **guion y página** | Las fichas de `chat.json` salían de la web de PNN y otras fuentes, **no de los guiones** | Paquete nuevo hecho solo de los guiones, por página | Juan |
| 3 | Reconocer límites: sin respaldo, **guiones que se contradicen**, información actual → remitir al guía; **nunca inventar seguridad** | Abstención calibrada y carril crítico determinista; **el banco ciego encontró huecos: 55/73** | Carril corregido (tildes, raíces, vocabulario, reglas de volcán y salud); conflictos entre guiones; bloquear la alerta del volcán que trae el guion zona norte (p. 7) y los tratamientos (UTON p. 54) | Juan |
| 4 | **Actualizable por el personal con fichas revisadas, sin tocar código** | Contenido en JSON, editado por el equipo en el repo | Panel del parque: editar o importar fichas, índice recalculado en el dispositivo, versión; **registro de preguntas sin respuesta** para que el personal cree fichas; sincronizar en Brisas antes de subir | Eduardo (UI) + Juan (motor) |
| 5 | Viable en alta montaña, **energía autónoma**: consumo medido y costo por estación | Sin medición | Medir el consumo del dispositivo (medidor USB o cálculo) y dimensionar panel solar + batería; costo por estación | Juan |
| 6 | Visitantes de todas las edades, español claro, interfaz sencilla (voz e inglés opcionales) | Interfaz accesible, tono «para niños», es/en, audio pregrabado | Pantalla enfocada: estación → pregunta → respuesta breve → «ampliar» → cita | Eduardo |
| — | Brisas como introducción; respuesta breve y ampliable; **relato distinto de ciencia** | Fichas cortas | `tipo: relato` con etiqueta; `breve` + `ampliar` | Juan + Eduardo |
| — | Preguntas difíciles: fuera de tema, con errores, premisa falsa («¿me puedo bañar en la laguna?»), inyección de instrucciones | Abstención + léxico tolerante a errores | Banco ciego nuevo con esas categorías; el LLM nunca recibe instrucciones del visitante como sistema | Juan |

**Entregables:** prototipo sin conexión (preguntas por estación, una sin respuesta y una de seguridad) · código en repo con
instrucciones · ficha de 1 página (modelo, consumo, costo por estación, actualización, sostenibilidad) · pitch de 3 minutos.

**Criterios del jurado (propuesta UTON):** fidelidad 25 · seguridad y abstención 25 · operación local y desempeño 20 · claridad 10 ·
actualización y energía 10 · demostración y documentación 10.

## Veredicto
La idea base **sí encaja y es fuerte en lo que más pesa (50 de 100 puntos: fidelidad y seguridad)**: recuperar el texto oficial,
citarlo y dejar que el LLM solo reescriba bajo verificación. Hay que **cambiar el foco**: de un álbum de cromos en el teléfono del
visitante a un **asistente por estación en el dispositivo del parque**, con contenido **solo de los guiones** y un **panel de
actualización**. El álbum, la Lente, el mapa y los cromos pasan al roadmap.
