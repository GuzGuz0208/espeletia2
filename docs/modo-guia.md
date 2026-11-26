# Modo guía: cómo lo usa el guía

El guía es obligatorio en el parque (máximo 8 visitantes por guía). La app no lo reemplaza: le da herramientas para entregar
cromos, confirmar lo que ve la Lente y fijar la hora de regreso, **sin internet**. Código: [js/guia.js](../js/guia.js).

## Entrar
1. En el teléfono del guía: **Ajustes → «Soy guía»**.
2. La primera vez crea un PIN (queda solo en ese teléfono; no se escribe en ningún documento).
3. Se abre la vista del guía: grupos de botones y, al elegir uno, un **QR grande y un código de 4 dígitos**.

## Qué puede entregar
| Grupo | Para qué | El visitante recibe |
|---|---|---|
| Historias | Cuenta la historia (el botón «Qué contar» trae el guion corto con su página) | Cromo de historia (23-26) |
| Estaciones | «Llegamos a…» cuando el GPS falla | Cromo de la estación (01-05) |
| Estamos en el parque | Al empezar el recorrido | Habilita la pausa (06) y la foto de grupo (07) |
| Confirmo lo que ve la Lente | Cuando la Lente duda o no reconoce | Cromo de flora o paisaje (08-16) |
| Paradas | Texto narrado en el idioma del visitante; «Terminé la explicación» | Cromo de la parada, una vez |
| Hora de regreso | Fija la hora (HH:MM) | Aviso de regreso en su teléfono, sin red |

## Cómo lo recibe el visitante
- **Lente → Leer QR** apuntando al teléfono del guía, o
- escribe el **código de 4 dígitos** en la ficha del cromo («Tengo un código del guía»).

El QR y el código cambian cada 5 minutos y sirven una vez por teléfono: una foto de un QR viejo no sirve. El teléfono del
visitante los verifica con su reloj, sin conexión.

## Límite conocido (demo)
La firma usa una clave HMAC que hoy está en `paquete.json`, que es público (decisión 13): alguien técnico podría generar
códigos. Solo afecta cromos y avisos de ruta, nunca las respuestas de Fray ni la seguridad. En producción: clave por
teléfono del guía o QR firmados con clave asimétrica.

## Ensayo rápido (2 teléfonos)
1. Teléfono A (visitante): abre la app y escribe un nombre.
2. Teléfono B (guía): Ajustes → Soy guía → PIN → «Estamos en el parque».
3. A: Lente → Leer QR → apunta a B → se abre el sobre → «Pegar en el álbum».
4. B: Historias → «Noviembre de 1985» → A escribe el código de 4 dígitos en la ficha del cromo.
5. A: abre el cromo → toca una de las preguntas de «Pregúntale a Fray» → Fray responde con su cita.
