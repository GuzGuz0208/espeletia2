# Publicar contenido nuevo para todos los teléfonos

Guía para el personal de la oficina de **Brisas** (donde hay internet completo). No hace falta saber programar.

## En resumen

**Panel → «Exportar para publicar» → doble clic en «Publicar» → en 1-2 minutos todos los teléfonos con señal lo reciben.**

Los visitantes no tienen que hacer nada: su teléfono baja la versión nueva y la activa solo.

## Paso a paso

1. **Edita en el Panel.** Abre el Panel del parque en el PC de Brisas, entra con el PIN y agrega o corrige las fichas
   (cada ficha cita su guion y página). Guarda.
2. **Exporta.** Pestaña **«Importar y exportar»** → botón **«Exportar para publicar»**. El navegador guarda el archivo
   `paquete-publicar.json` en la carpeta **Descargas**. (Si ya había uno, bórralo antes para que no quede con otro nombre,
   como `paquete-publicar (1).json`.)
3. **Avisos del día (opcional).** Si hay avisos operativos (por ejemplo, «Hoy el grupo sale de Brisas a las 8:30»), deja
   el archivo `avisos.json` en **Descargas**. Si no hay, no hagas nada.
   Los avisos **nunca** hablan del volcán, alertas ni salud: eso lo dice el personal en persona. Si alguno lo hace, la
   publicación se detiene y te dice cuál es.
4. **Publica.** Doble clic en **«Publicar»** (el acceso directo del escritorio, que abre `herramientas\Publicar.cmd`).
   Se abre una ventana que:
   - revisa que las fichas estén bien (si hay un error, lo dice y **no publica nada**);
   - firma el paquete con la llave del parque (la llave vive solo en este PC; nunca sale de aquí);
   - lo sube a internet.

   Al final dice **«Listo: versión … publicada»**. Pulsa Enter para cerrar.
5. **Espera 1-2 minutos.** El sitio se actualiza solo. A partir de ahí:
   - todo teléfono **con la app abierta y con señal** la recibe en menos de 10 minutos (al instante si recupera la señal o
     si el visitante vuelve a la app);
   - todo teléfono que **abra la app** con señal la recibe al abrir;
   - en el teléfono aparece unos segundos **«Contenido actualizado: versión …»**.

## Cuándo llega a cada teléfono

| Dónde está el visitante | Qué pasa |
|---|---|
| Brisas (internet completo) | Lo recibe en 1-2 minutos (o al abrir la app). |
| Otra estación (Starlink, a ratos) | Lo recibe en cuanto haya señal; si se corta a mitad, lo vuelve a intentar solo cada pocos segundos. |
| En el sendero (sin señal) | Sigue con la versión que ya tenía; la recibe en la siguiente estación con señal. |

Los teléfonos solo aceptan paquetes firmados con la llave del parque: un archivo alterado o ajeno se rechaza.
Cada actualización recibida renueva también las 24 h de uso del contenido en el teléfono.

## Si algo sale mal

- **«No encontré …paquete-publicar.json»:** vuelve al paso 2.
- **«El paquete NO se publicó»:** lee el error de arriba (dice qué ficha o aviso falla), corrígelo en el Panel, exporta otra
  vez y vuelve a publicar.
- **«La versión … ya estaba publicada»:** no había cambios nuevos. Si sí los hiciste, guárdalos en el Panel antes de exportar.
- **«No pude subir (¿sin internet?)»:** espera a tener internet y vuelve a hacer doble clic en «Publicar». No se pierde nada.
- **Hay que deshacer:** en cada teléfono, Panel → Sincronización → «Volver a la versión anterior»; o publica una versión nueva
  con la ficha corregida (recomendado: llega a todos).

## Preguntas que Fray no supo responder

Los teléfonos guardan esas preguntas (sin datos personales). El sitio en internet no las recibe todavía: se quedan en cada
teléfono hasta que haya dónde subirlas.

- **Hoy:** en la wifi de Brisas, el servidor de la base (`servidor/sync_base.py`, ver `servidor/LEEME.md`) las recibe si en el
  Panel → Sincronización → «Dónde se suben las preguntas sin respuesta» se pone su dirección (por ejemplo
  `http://192.168.4.1:8090`). También se pueden exportar por USB.
- **Próximamente (roadmap):** una función en el mismo sitio de internet, con almacenamiento, para recibirlas desde cualquier
  estación con señal.

## Una sola vez (lo hace soporte, no el personal)

- PC de Brisas con `git` y Python con `cryptography`; el repositorio clonado y con permiso para subir a `main`.
- La llave privada del parque en `C:\Users\danna\espeletia-llm\claves\fray_privada.pem` (o la carpeta de la variable
  `FRAY_CLAVES`). **Nunca** se copia al repositorio.
- Un acceso directo en el escritorio llamado «Publicar» que apunte a `herramientas\Publicar.cmd`.
- En Linux o Mac: `herramientas/publicar.sh` hace lo mismo.
