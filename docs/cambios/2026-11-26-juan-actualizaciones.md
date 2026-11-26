## Actualizaciones obligatorias y automáticas (contenido y código)

Lo que el personal publica en Brisas llega solo a todo teléfono con señal. El Panel tiene «Exportar para publicar» y un doble
clic en `herramientas\Publicar.cmd` firma el paquete, lo copia a `publicado/` y hace push a main (Vercel redespliega en ~1 min).
La app revisa `{origen}/publicado` al abrir, con `online`, al volver a la app y cada 10 min (timeout 8 s, backoff corto con
señal intermitente) y activa sola la versión firmada nueva, con el aviso «Contenido actualizado: versión …». Cada descarga
renueva la vigencia de 24 h. Cuando llega un service worker nuevo, la página se recarga una vez y solo con la caja de texto
vacía. Las preguntas sin respuesta se quedan en cola en el teléfono hasta que haya `urlSubida` (servidor de la base).

Ganchos de UI en `js/actualizar.js` (`iniciarActualizaciones`). Decisión 12, contrato §5.8, guía `docs/operacion-base.md`.
Prueba `node pruebas/test_actualizaciones.mjs`.
