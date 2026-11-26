# Roadmap: de la hackatón al parque

Cómo vemos a Fray a futuro. Tres horizontes; las fechas se acuerdan con UTON (PENDIENTE). Lo que viene del proyecto anterior
(Álbum del Páramo, repo `espeletia-ai`, 24-25 nov) se marca **[ya existe]** cuando hay código o medición, y **[propuesta]**
cuando es solo diseño. Lo que no está medido, no se promete.

## Horizonte 0 · Hackatón (26-nov-2026)
- Asistente por estación en el dispositivo del parque: recuperar → citar → (reescribir) → verificar; carril crítico; abstención;
  conflictos visibles; panel para actualizar sin código; QR de estación firmados.
- Cromo por estación como recompensa por detenerse y preguntar (spec de cromos, rama `eduardo/cromos`), con el dato literal del
  guion y su página en el reverso.
- Mediciones del día: consumo en el dispositivo, tiempo por respuesta, banco ciego con las categorías del reto (PENDIENTE).

## Horizonte 1 · Piloto con UTON (una estación y los guías de una temporada)
| Tema | Qué haríamos | Base que ya existe | Depende de | Riesgo |
|---|---|---|---|---|
| **Contenido validado** | UTON revisa cada ficha (estado `validado`) y define quién recibe las consultas derivadas | Pipeline guion → fichas con página; panel | Personal de UTON con tiempo para revisar | Fichas en borrador que nadie valida |
| **Kiosco solar por estación** | Caja para frío y humedad, panel y batería dimensionados con el consumo medido | [docs/energia.md](energia.md) (en curso) | Medición real; permiso del parque para instalar | Frío y altitud bajan la capacidad de la batería; mantenimiento |
| **App Android nativa** | Flutter + llamadart con el LLM nativo en el teléfono del guía | **[ya existe]** APK arm64 compilada (`album-paramo-nativo-arm64.apk`) | Medir velocidad y calor en teléfonos reales | El 24-nov un modelo de 0,5B en el navegador congeló un teléfono de gama media-alta |
| **Modelo** | Finalistas Qwen3.5-2B y Qwen2.5-1.5B (Apache-2.0); elegir con el banco de los guiones; probar Qwen3-1.7B y Gemma 4 E2B (bajados, sin medir) | **[ya existe]** medición en PC del 25-nov y verificador | Banco de preguntas de los guiones | Un modelo más grande escribe mejor pero tarda y calienta |
| **Panel web del parque** | El mismo panel, servido en la oficina de Brisas: edita, valida, versiona y copia el paquete a los dispositivos antes de subir | Panel local del Horizonte 0 | Red local en Brisas o copia por USB | Versiones distintas entre dispositivos (se muestra la versión en pantalla) |
| **Analítica sin datos personales** | Conteo de preguntas sin respuesta por estación → nuevas fichas validadas | `fray.sinRespuesta()` en el dispositivo | Que alguien de UTON lo revise cada semana | Que una pregunta escrita traiga datos personales: se muestra solo al personal y se borra tras revisar |
| **Avisos oficiales de volcán o salud** | Hoy los avisos del día son solo operativos y el validador rechaza volcán, alertas y salud (contrato §6). Proponer con UTON un canal aparte: emisor autorizado por cargo, texto literal del SGC o del protocolo del parque, vigencia corta y otra firma | **[ya existe]** avisos operativos firmados y con vigencia (decisión 9) | Protocolo de UTON y del SGC; quién firma | Un aviso viejo sobre el volcán es peor que ninguno: por eso hoy siempre remite al personal |
| **Voz (1.ª parte)** | Audio pregrabado del texto validado, voz es-CO grabada con personas; dictado offline si el dispositivo lo tiene | **[propuesta]** decisión voz-audio-pregrabado; voces Piper con licencia comercial revisadas (24-nov) | Grabar con personas; cada cambio de ficha exige regrabar | No hay voz colombiana abierta con uso comercial (revisado el 24-nov) |

## Horizonte 2 · Escala (todo el sector norte y otros parques)
| Tema | Qué haríamos | Base que ya existe | Depende de | Riesgo |
|---|---|---|---|---|
| **Álbum del Páramo** | 24 cromos en 4 capítulos (sendero, flora y paisaje, fauna, historias del guía), QR firmados de estación y fauna, mapa 2D y 3D del sendero con relieve Copernicus, modo guía con QR que cambian cada 5 min, certificado en PDF «Guardián del páramo» | **[ya existe]** prueba de concepto con guía de uso (fuentes/guia-album-del-paramo.pdf) | Todos los datos de los cromos pasados a fichas de los guiones; permiso para QR en la señalética | Que distraiga: regla de no mirar el teléfono caminando, el sobre se abre en las paradas |
| **Diseños** | Identidad visual del parque con los personajes Fray (frailejón), el Cóndor y Magma (el volcán) en cromos, pantallas y kiosco | **[ya existe]** ilustraciones propias en SVG del proyecto anterior | Aprobación de marca de UTON y PNN | Usar marcas oficiales sin permiso |
| **Fotos propias para el álbum** | Lente entrenada con fotos tomadas en el sendero; el visitante pone su foto en el cromo | **[ya existe]** Lente (MobileNetV2 + k-NN, Apache-2.0), aprendió con 120 fotos de Wikimedia Commons | Jornada de fotos del equipo en el sendero | Hoy duda: con 3 fotos reales de frailejón, ninguna pasó de 50 % de certeza |
| **Voz (2.ª parte)** | Síntesis de voz offline para fichas nuevas sin regrabar; voces solo con licencia comercial | Lista de voces aptas (es_ES-davefx CC0, en_US-joe CC0…) | Entrenar una voz es-CO con datos de licencia clara | Licencias encadenadas de los datos de entrenamiento |
| **Traducción en vivo** | Guía → visitante extranjero, offline: voz a texto (Vosk small-es, Apache-2.0, 39 MB), texto a texto (Bergamot MPL-2.0 u Opus-MT Apache-2.0), con verificación de fidelidad (cifras y nombres iguales al original, como el verificador) | **[propuesta]** spike de traducción en vivo; NLLB descartado por licencia no comercial | Medir calidad es → en con el guion | La traducción cambia el sentido (ficha técnica p. 3): por eso, verificar y mostrar el original |
| **Modelo (2.ª parte)** | Ajuste fino con contenido validado por UTON; usar NPU o GPU del teléfono; LiteRT-LM | PUBLICADO por Google: 47-52 tokens/s con Gemma 4 E2B en un teléfono de gama alta (decisión apk-android-llm-nativo) | Datos validados suficientes; teléfonos con NPU | El ajuste fino no reemplaza la recuperación ni el verificador |
| **iOS** | Versión para iPhone | La app web funciona sin el LLM nativo | **Cuenta Apple Developer y Mac** (hoy no la tenemos) | Costo anual de la cuenta |
| **Otros parques** | Misma app, otro paquete de fichas | Contrato del paquete (contrato.md §1) | Autorización del dueño de cada guion | Contenido sin validar |

## Qué necesitamos de UTON
1. **Contenido validado:** revisión de fichas, versión vigente de los guiones y la persona y el protocolo que reciben las consultas
   derivadas (presentación del reto, diap. 25).
2. **Dispositivos:** el equipo definitivo por estación y teléfonos de guías para medir; permiso para instalar el kiosco.
3. **Cuenta Apple** (o un aliado con Mac) para iOS.
4. **Fotos y voz:** acceso al sendero para tomar fotos y grabar las voces es-CO con personas.
5. **Marca:** permiso para la identidad visual y los personajes.

## Riesgos generales
- **Seguridad:** ninguna versión dirá el estado del volcán, si algo se come o qué medicamento tomar; remite al personal. Las reglas
  son deterministas y se prueban con bancos ciegos al 100 % antes de cada versión.
- **Energía y clima:** el consumo real decide si el kiosco es viable; se mide antes de prometer.
- **Mantenimiento:** sin personal que valide fichas, el contenido se queda viejo; el registro de preguntas sin respuesta lo hace
  visible.
