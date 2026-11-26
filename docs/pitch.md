# Pitch de 3 minutos (video)

Lo que pide el reto: problema, solución, prueba y límites (diap. 24). Criterio 4 de la rúbrica: demo 100 % local con
preguntas por estación, cita de guion y página, abstención segura, actualización sin cambiar código, ficha técnica y pitch.
Lo que va entre comillas angulares se dice; lo que va entre corchetes se muestra en pantalla. **Medido** = medido por
nosotros (archivo en `pruebas/`); nada se dice sin fuente.

## 1. Problema (0:00-0:20)
> En temporada alta un guía del Nevado no alcanza a responder a todos, y arriba no hay señal. El visitante se queda solo
> con sus preguntas. Hicimos el Álbum del Páramo: un álbum de cromos con un guía, Fray, que funciona en modo avión en el
> celular del visitante. [portada del álbum y cromos por estación]

## 2. Demo en modo avión (0:20-1:30)
> Todo lo que van a ver está en modo avión. [ícono de modo avión]
> En Aguacerales pregunto: ¿qué papel cumple el frailejón? Fray responde con el guion y su página. [cita visible]
> En Lunares escribo con errores: «porqe se rompen las piedras». Entiende: es la gelifracción, con su página.
> En Arenales: ¿por qué no pisar las dunas? Y en el Valle de las Tumbas: ¿por qué se llama así? Siempre con la cita.
> Si los guiones no lo dicen, no inventa: ¿hay restaurante en Brisas? «No tengo esa información, pregúntale a tu guía».
> Y en seguridad manda la regla: ¿cuál es la alerta del volcán hoy? Remite al personal del parque y nunca da un nivel.
> Al abrir un cromo, Fray propone una pregunta sobre él. [tocar la pregunta del cromo]

## 3. Por qué un álbum (1:30-2:00)
> Las experiencias con juego mejoran el aprendizaje: un metaanálisis encontró un efecto positivo de la gamificación en el
> aprendizaje, y las revisiones en museos y turismo reportan más motivación y participación de los visitantes. Por eso
> los cromos se ganan en las paradas, nunca caminando: la app vibra y guarda, y el visitante mira el páramo.

Respaldo: Sailer y Homner (2020), *The gamification of learning: a meta-analysis*, Educational Psychology Review 32,
77-112 (g = 0,49 en resultados cognitivos; doi 10.1007/s10648-019-09498-w). Revisión sistemática de gamificación en
turismo (Journal of Service Theory and Practice, doi 10.1108/JSTP-05-2020-0094). No hay una cifra específica de turismo:
no se dice «aumenta las visitas X %».

## 4. Cómo garantizamos que no inventa y que funciona (2:00-2:30)
> Toda respuesta sale de los dos guiones oficiales con su página. Una IA local la redacta solo si pasa un verificador, y
> las reglas de seguridad mandan sobre todo. Medido en este teléfono, sin red: la respuesta llega en unos tres segundos y
> gasta 0,22 miliamperios hora por pregunta. El parque actualiza el contenido desde un panel, sin tocar código, y el
> contenido vence a las 24 horas. [Panel → ficha → publicar]

Respaldo (medido, Redmi Note 15 Pro, modo avión): mediana 3,3 s en 20 preguntas; 0,22 mAh/pregunta es la estimación de
Android para la app, sin pantalla (no amperímetro) — [energia-telefono-2026-11-26.json](../pruebas/resultados/energia-telefono-2026-11-26.json).
Banco ciego del reto: 89 % ([resultados](../pruebas/resultados/ciego-reto-2026-11-26.md)).

## 5. Roadmap y cierre (2:30-3:00)
> Lo que viene: paquetes de voces en varios idiomas; traducción en vivo para extranjeros que no dominan el español; una
> Lente que identifique fauna; y estaciones complementarias para una experiencia más inmersiva. Fray no reemplaza al
> guía: le ayuda a llegar a todos. Gracias.

Conteo: 337 palabras dichas (~2:25 a 140 por minuto): deja unos 35 s para que la demo corra en pantalla. Se recuenta con el script del final si cambia el texto.

## Si el jurado pregunta
**¿Por qué no un modelo grande?** Porque no cabe ni responde rápido en un celular sin red, y un modelo grande también puede
inventar. Lo que da seguridad es recuperar, citar y verificar. El modelo de 2B respondió mejor en PC pero es unas dos
veces más lento: no cumple los 4 segundos.

**¿Qué pasa si la IA falla?** Sale el texto del guion con su cita. Las preguntas de seguridad nunca pasan por la IA.

**¿Cómo se actualiza sin red?** El personal edita fichas en el Panel y publica; cada teléfono baja la versión firmada al
tener señal (Brisas o estaciones con Starlink). Arriba nadie tiene que cambiar nada.

**¿Y la energía?** Corre en el celular del visitante: no hay que instalar energía en el páramo. 100 preguntas gastan cerca
del 0,4 % de una batería de 5 937 mAh en cálculo (estimado), más la pantalla.

**¿Qué tan seguro es el modo guía?** Es una demo: la clave que firma los códigos del guía está en un archivo público
(decisión 13). El contenido y las actualizaciones sí van firmados con clave asimétrica.

## Conteo de palabras
```bash
python -X utf8 -c "import re;t=open('docs/pitch.md',encoding='utf-8').read();t=t.split('## Si el jurado')[0];s=' '.join(l[1:] for l in t.splitlines() if l.startswith('>'));s=re.sub(r'\[[^\]]*\]','',s);print(len(s.split()))"
```
