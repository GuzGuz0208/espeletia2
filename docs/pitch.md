# Pitch de 3 minutos

Lo que pide el reto: «Problema, solución, prueba y límites que siguen abiertos» (presentación del reto, diap. 24). Criterios del
jurado (diap. 23): fidelidad 25 · seguridad y abstención 25 · operación local y desempeño 20 · claridad 10 · actualización y
energía 10 · demostración y documentación 10.

Quién habla: una persona narra y otra maneja el dispositivo (guion de la demo en [demo.md](demo.md)). El texto entre comillas
angulares se dice; lo que va entre corchetes se hace. Los «PENDIENTE» se reemplazan con las cifras medidas antes de presentar; si no
hay cifra, se dice «lo estamos midiendo» y no se inventa.

## 1. Problema (0:00-0:25)
> En temporada alta, un guía del Nevado no alcanza a responder a todos. Después de la inducción, el visitante se queda solo con sus
> preguntas sobre el agua, el frailejón o las rocas. Y arriba no hay señal ni red eléctrica: una app en la nube o un QR con enlace
> no sirven. Les presentamos el Álbum del Páramo: cromos que se ganan en cada estación y, dentro, Fray, un guía que funciona sin
> señal en el celular del visitante y responde solo con los dos guiones de UTON. [abre el álbum: portada y cromos por estación]

Respaldo: ficha técnica del reto, p. 1 (cobertura, continuidad, tecnología).

## 2. Demo en vivo (0:25-1:35)
> Todo lo que van a ver está en modo avión. [muestra el ícono] Llego a Lunares: el álbum me da el cromo de la estación, con
> su dato y su página del guion. [muestra el cromo] Estoy en Lunares y pregunto: ¿por qué se fracturan las rocas?
> [escribe] Fray responde al instante con el texto del guion: es la gelifracción. Y abajo, la fuente: Guion Ecoturístico UTON 2024,
> página 8. [toca «ampliar»] Si quiero más, amplío.
>
> Ahora algo que los guiones no dicen: ¿hay restaurante en Brisas? Un modelo pequeño que probamos respondió que sí. Fray dice: no
> tengo esa información en los guiones; pregúntale a tu guía.
>
> Seguridad: ¿cuál es la alerta del volcán hoy? El guion menciona un nivel de alerta, pero es un dato que cambia. Fray no lo repite:
> remite al personal del parque.
>
> Si los guiones difieren, como en el significado de Kumanday, muestra las dos versiones, cada una con su página.
>
> Por último, actualizar. Esta pregunta quedó sin respuesta. [abre el panel] Desde el panel, con PIN, el personal carga una ficha
> revisada, sin tocar código. Pregunto otra vez: ahora responde, con su página. Y el cromo que gané queda en mi álbum.

## 3. Cómo garantizamos que no inventa (1:35-2:15)
> ¿Cómo sabemos que no inventa? Cinco capas. Uno, recuperar: un modelo de búsqueda local encuentra el fragmento del guion. Dos,
> citar: toda respuesta lleva guion y página. Tres, verificar: un modelo de lenguaje local, Qwen, solo reescribe ese fragmento, y un
> verificador revisa que cada cifra y cada nombre estén en el guion; si falla o tarda, queda el texto original. Cuatro, un carril
> crítico de reglas para volcán, salud y emergencias, que manda sobre todo, incluso sobre el guion. Y cinco, pruebas ciegas: nuestro
> banco ciego del reto, ciento quince preguntas que no usamos para ajustar: ochenta y nueve por ciento de aciertos, y tres
> preguntas de seguridad que todavía se escapan; las mostramos, no las escondemos. En este celular, sin red, la primera palabra
> sale en uno a dos segundos y la respuesta completa en dos y medio a cinco.

Respaldo (medido): banco ciego 102/115 semántico, 85/115 léxico; puerta de seguridad del banco ciego falla en 3
([resultados](../pruebas/resultados/ciego-reto-2026-11-26.md)). Teléfono REDMI Note 15 Pro, APK con Qwen3.5-0.8B en modo avión:
1,1-2 s a la primera palabra, 2,5-5,4 s por respuesta, 12-16 tokens/s, batería 33,8 → 35,9 °C durante la prueba.

## 4. Energía y costo (2:15-2:40)
> Corre en el celular del visitante: no hay que instalar energía en el páramo. En la prueba, la batería pasó de treinta y tres
> coma ocho a treinta y cinco coma nueve grados: no se recalienta. Las licencias cuestan cero: todo es MIT o Apache, con uso
> comercial permitido.

Medido: temperatura de batería 33,8 → 35,9 °C (REDMI Note 15 Pro). Estimado, no medido: consumo en vatios y autonomía.

Respaldo: [energia.md](energia.md) y [ficha-una-pagina.md](ficha-una-pagina.md).

## 5. Límites abiertos y futuro (2:40-3:00)
> Lo que sigue abierto: cerrar esas tres preguntas de seguridad, medir en más teléfonos y que UTON valide cada ficha. Lo que viene:
> voz sin conexión e inglés verificado. [vuelve al álbum completo] Al salir, el visitante se lleva su álbum, sin los textos del
> parque. Fray no reemplaza al guía: le ayuda a llegar a todos. Gracias.

Respaldo: [roadmap.md](roadmap.md).

Conteo: 521 palabras dichas (se recuenta con el script del final si cambia el texto). A 140 palabras por minuto son unos 3:40:
**hay que recortar unas 100 palabras** (candidatas: Kumanday y el paso de actualizar en la sección 2).

## Si el jurado pregunta
**¿Por qué no un modelo grande?**
> Porque no cabe ni responde rápido en un dispositivo de estación sin red eléctrica, y porque un modelo grande también puede
> inventar. Lo que da seguridad es recuperar, citar y verificar. Medimos seis modelos pequeños en CPU: el mejor, Qwen3.5-2B, acertó
> 23 de 25; uno de 1B afirmó un restaurante que no existe.

**¿Qué pasa si el modelo falla?**
> La respuesta del guion con su cita sale primero y no depende del modelo generativo. Si el modelo no carga, si el verificador lo
> rechaza o si tarda, el visitante ve el texto del guion. Las preguntas de seguridad nunca pasan por el modelo.

**¿Cómo se actualiza sin red?**
> En Brisas, antes de subir, donde empieza la inducción. El personal carga la ficha revisada en el panel; el índice se recalcula en
> el dispositivo y queda una versión con vuelta atrás. Arriba nadie tiene que cambiar nada.

**¿Un dispositivo por estación alcanza para tanta gente?** (salió en la sesión de explicación del reto)
> No pretende atender a todos ni reemplazar al guía: le quita las preguntas repetidas. La reglamentación del parque ya prevé guianza
> por estaciones en temporada alta. El siguiente paso es la misma app en el teléfono de cada guía, que ya corre en Android como APK con IA local.

Fuente de la última: PNN Los Nevados, Anexo de reglamentación transitoria del ecoturismo, dic-2023, p. 15 («guianza por estaciones
ubicadas en el carreteable»), recopilado en la investigación del proyecto anterior; confirmar vigencia con UTON.

**¿Qué tan seguro es el modo guía?**
> Es una demo: la clave que firma los códigos del guía está en un archivo público. En producción cada guía tiene su propia clave
> en su teléfono (ver riesgo en decisiones). El contenido y las actualizaciones sí van firmados con clave asimétrica.

## Conteo de palabras
```bash
python -X utf8 -c "import re;t=open('docs/pitch.md',encoding='utf-8').read();t=t.split('## Si el jurado')[0];s=' '.join(l[1:] for l in t.splitlines() if l.startswith('>'));s=re.sub(r'\[[^\]]*\]','',s);print(len(s.split()))"
```
