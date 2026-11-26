# Borrador de diapositivas (9)

Para pasar luego a una presentación. Cada diapositiva: título, 3 viñetas y la nota de lo que se dice (sale de [pitch.md](pitch.md)).
Las diapositivas 3 a 5 acompañan la demo en vivo: si la demo corre, se muestran solo un segundo o se saltan.

## 1. Fray · guía de páramo sin señal
- Asistente de interpretación ambiental para Brisas → Valle de las Tumbas
- 100 % sin conexión, en el dispositivo del parque
- Responde solo con los guiones de UTON, con guion y página

Nota: presentación del equipo y del nombre (5 s).

## 2. El problema en las estaciones
- Cobertura: en temporada alta el personal no alcanza a responder todo
- Continuidad: después de la inducción, el visitante no tiene a quién preguntar
- Sin señal ni red eléctrica: apps en la nube y QR con enlace no sirven

Nota: bloque 1 del pitch. Fuente en pantalla: ficha técnica del reto, p. 1.

## 3. Demo: una pregunta por estación
- «¿Por qué se fracturan las rocas en Lunares?»
- Respuesta breve con el texto del guion + «ampliar»
- Fuente visible: Guion Ecoturístico UTON 2024 · p. 8

Nota: todo en modo avión; se muestra el ícono.

## 4. Demo: reconoce sus límites
- Sin respaldo («¿hay restaurante en Brisas?») → «pregúntale a tu guía»
- Dato que cambia («¿cuál es la alerta del volcán hoy?») → personal del parque, aunque el guion lo mencione
- Guiones que difieren (Kumanday) → las dos versiones, cada una con su página

Nota: un modelo pequeño que medimos afirmó que había restaurante; Fray no.

## 5. Demo: el personal lo actualiza sin código
- La pregunta sin respuesta queda registrada (sin datos personales)
- Panel con PIN: importar ficha revisada → índice recalculado → versión nueva
- Se sincroniza en Brisas antes de subir; se puede volver atrás

Nota: repetir la pregunta y mostrar la cita de la ficha nueva (UTON 2024, p. 9).

## 6. Cómo garantizamos que no inventa
- Recuperar (e5-small, MIT) y citar guion y página
- Reescribir con Qwen local (Apache-2.0) solo si el verificador lo aprueba; si no, queda el guion
- Carril crítico de reglas (volcán, salud, emergencia) + pruebas ciegas

Nota: bloque 3. Cifras: Qwen3.5-2B 23/25 y Qwen2.5-1.5B 22/25 (MEDIDO 25-nov, PC, CPU); banco ciego de seguridad 55/73: 18 huecos
que estamos cerrando.

## 7. Energía y costo por estación
- Consumo MEDIDO: PENDIENTE W en espera · PENDIENTE W respondiendo
- Panel PENDIENTE + batería PENDIENTE → PENDIENTE pesos por estación ([energia.md](energia.md))
- Licencias: 0 (MIT y Apache-2.0, uso comercial)

Nota: bloque 4. Si no hay medición, decir «lo estamos midiendo» y el método (medidor USB).

## 8. Lo que viene
- Piloto con UTON: kiosco solar en una estación y app Android en el teléfono del guía
- Voz sin conexión (es-CO grabada con personas) e inglés con verificación de fidelidad
- Álbum del Páramo: cromos, mapa 3D, modo guía y Lente con fotos del sendero

Nota: bloque 5. Detalle en [roadmap.md](roadmap.md).

## 9. Límites abiertos y cierre
- Falta: medir en más dispositivos y que UTON valide cada ficha
- Nunca dirá el estado del volcán ni dará consejos de salud: remite al personal
- Fray no reemplaza al guía: le ayuda a llegar a todos

Nota: «Gracias». Dejar en pantalla el enlace al repositorio (privado, acceso para el jurado si lo piden).
