# Álbum del Páramo con Fray · guía de páramo sin señal

App para los visitantes del sector norte del PNN Los Nevados (Brisas → Aguacerales → Arenales → Lunares → Valle de las
Tumbas). Un **álbum de cromos** que se ganan en las paradas y, dentro, **Fray**, un guía que responde **en modo avión**
y **solo con los dos guiones oficiales de UTON**, citando guion y página. Cuando no hay respaldo, cuando los guiones
difieren o cuando la pregunta es de seguridad (volcán, salud, comer, agua, emergencias, clima o acceso de hoy), **se
abstiene y remite al guía**. No reemplaza al guía: le ayuda a llegar a todos.

Reto «Guía de páramo sin señal» · UTON / ACOPI Caldas / Universidad de Caldas · Hackathon Innova Generaciones · 26-nov-2026.
Repo privado: el contenido oficial solo se usa para el reto.

## Entregables
| | |
|---|---|
| 🎬 **Video** (funcionamiento de la app y pitch) | [Ver en Google Drive](https://drive.google.com/file/d/1g6NtGIxz7ijwzamrqxvLunwMnoYD95J3/view?usp=sharing) |
| 📘 **Manual de usuario** (visitante, guía, personal del parque y cómo cumple la rúbrica, 26 págs.) | [docs/manual-usuario.pdf](docs/manual-usuario.pdf) |
| 📄 **Ficha técnica** (una hoja: problema, arquitectura, modelos, consumo, costo por estación, réplica, roadmap) | [docs/ficha-tecnica.pdf](docs/ficha-tecnica.pdf) · [fuente HTML](docs/ficha-tecnica.html) |
| 📱 **App** | https://espeletia2.vercel.app · APK Android: botón en la primera pantalla |
| 🎤 **Pitch (3 min)** · **Demo** · **Rúbrica** | [docs/pitch.md](docs/pitch.md) · [docs/demo.md](docs/demo.md) · [docs/rubrica.md](docs/rubrica.md) |

## Usarlo
| Quién | Cómo |
|---|---|
| Visitante con Android | Descarga la app **Fray** (APK, botón en la primera pantalla de https://espeletia2.vercel.app). Ábrela una vez con wifi: baja la IA local (~530 MB). Luego funciona en modo avión. |
| Visitante con iPhone u otro | Abre https://espeletia2.vercel.app con señal e instálala en la pantalla de inicio. Funciona en modo avión con la búsqueda local y las citas (sin la IA que redacta). |
| Guía | Ajustes → «Soy guía» → PIN. Entrega cromos, confirma lo que ve la Lente y fija la hora de regreso con QR y códigos que cambian cada 5 min. [docs/modo-guia.md](docs/modo-guia.md) |
| Personal del parque | `panel.html` con PIN: fichas, preguntas sin respuesta, versiones. Publicar para todos los teléfonos con `herramientas/Publicar.cmd`, sin tocar código. [docs/operacion-base.md](docs/operacion-base.md) |

El contenido del parque **vence a las 24 h** de activarse en el teléfono y se renueva al abrir la app con señal.
Los códigos para imprimir (QR de estación y de fauna) están en la app: Ajustes → Modo equipo → Códigos para imprimir.

## Cómo funciona
```
pregunta → carril de seguridad (reglas fijas, mandan siempre)
         → búsqueda local en 154 fichas de los 2 guiones (e5-small en el teléfono, ONNX)
         → respuesta del guion con «guion · página»  ──►  IA local (Qwen3.5-0.8B, solo en la APK) la redacta
                                                          si pasa el verificador antes de 4,5 s; si no, el texto del guion
```
Sin nube ni API externa en ejecución: todo (modelos, librerías, contenido) se guarda en el teléfono la primera vez.
Detalle: [docs/contrato.md](docs/contrato.md) · decisiones: [docs/decisiones/](docs/decisiones/README.md).

## Cifras (medidas en un Redmi Note 15 Pro, modo avión, 26-nov)
| Medida | Valor |
|---|---|
| Respuesta completa (búsqueda + IA), 20 preguntas | mediana 3,3 s (2,1-5,1 s) |
| Primera palabra de la IA | 1,1-3 s · 12-16 tokens/s |
| Seguridad y «no tengo esa información» | menos de 0,3 s |
| Energía | 0,22 mAh por pregunta (estimación de Android para la app, sin pantalla; no es amperímetro) |
| Temperatura de batería | 33,8 → 36,7 °C |
| PDF del álbum (8 páginas) | 0,8 s |
| Banco ciego del reto (115 preguntas, una medición) | 89 % semántico · 74 % léxico · 54/57 citas correctas |

Evidencia por criterio de la rúbrica: [docs/rubrica.md](docs/rubrica.md) · registros: [pruebas/registros/](pruebas/registros/) ·
resultados: [pruebas/resultados/](pruebas/resultados/).

## Correrlo en un computador
Requisitos: Python 3.11+ y Node 20+. La app no tiene dependencias que instalar.
```bash
python -m http.server 8000 --bind 127.0.0.1   # en la raíz del repo
# abrir http://127.0.0.1:8000/  (visitante)   ·   http://127.0.0.1:8000/panel.html  (Panel)
```
Tras la primera carga, `sw.js` deja todo guardado para modo avión. Despliegue: Vercel, sitio estático, automático desde `main`.

### Pruebas (antes de fusionar)
| Comando | Qué hace |
|---|---|
| `python -X utf8 herramientas/evaluar.py` | Evalúa con `contenido/preguntas_desarrollo.json` y `pruebas/*.json`; **puerta de seguridad al 100 %** o sale con 1 |
| `python -X utf8 herramientas/evaluar.py --ciego` | Banco ciego (`pruebas/ciego*`): se mide una vez y no se usa para ajustar |
| `python -X utf8 herramientas/paridad.py [--regenerar]` | Carril y charla de JS vs Python: diferencia 0. `--regenerar` rehace `herramientas/carril_py.py` desde `js/carril.js` |
| `node pruebas/test_actualizaciones.mjs` · `test_sync.mjs` · `test_vigencia.mjs` | Actualizaciones firmadas, sincronización y vigencia de 24 h |
| `python -X utf8 herramientas/validar_paquete.py` | Revisa las fichas del paquete |
| `python -X utf8 herramientas/fray_py.py --indice` | Rehace `contenido/indice.json` al cambiar el paquete |

### En el teléfono (Android por USB)
| Comando | Qué hace |
|---|---|
| `powershell -ExecutionPolicy Bypass -File herramientas\registros_adb.ps1 -Serial <serial>` | Saca el registro de la prueba (teléfono desbloqueado, Fray abierta) |
| `node herramientas/energia_telefono.mjs <serial>` | Mide 20 preguntas: tiempos, IA verificada, energía estimada y temperatura |

### APK (`nativo/`)
```bash
cd nativo && flutter build apk --release --target-platform android-arm64
cp build/app/outputs/flutter-apk/app-release.apk ../descargas/fray-paramo-arm64.apk
```
La APK abre la misma web en un WebView y le agrega la IA local (llamadart / llama.cpp). Detalle: [nativo/README.md](nativo/README.md).

## Reglas del proyecto
[AGENTS.md](AGENTS.md): cero red en ejecución, todo dato con fuente, nunca el estado del volcán ni «se come», el guía en el
centro, nada que obligue a caminar mirando el teléfono. Si cambias la app, sube la versión de `sw.js`.

## Documentos
[Pitch (3 min)](docs/pitch.md) · [Demo](docs/demo.md) · [Rúbrica](docs/rubrica.md) · [Ficha de una página](docs/ficha-una-pagina.md) ·
[Modo guía](docs/modo-guia.md) · [Operación](docs/operacion-base.md) · [Roadmap](docs/roadmap.md) · Base: [dsalazardev/espeletia-ai](https://github.com/dsalazardev/espeletia-ai).
