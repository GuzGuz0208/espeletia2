# Fray · Guía de páramo para Android (Flutter)

APK Android que **abre la misma PWA** (https://espeletia2.vercel.app/) en un WebView y le agrega la **IA local** (LLM en el
teléfono con [llamadart](https://pub.dev/packages/llamadart) / llama.cpp) por el puente `window.FrayNativo`. El APK es solo el
envoltorio: **no trae la PWA, ni `contenido/`, ni `models/`** (el contenido llega con la PWA y vence a las 24 h en el teléfono).
Paquete Android: `co.fray.paramo`.

| Pieza | Qué hace |
|---|---|
| WebView | Carga https://espeletia2.vercel.app/ la primera vez con señal (Brisas, hotel o una estación con Starlink). El service worker de la PWA la guarda y desde ahí funciona en **modo avión**. Solo se navega dentro de ese origen. Concede cámara (QR), micrófono y GPS si la página los pide. |
| `window.FrayNativo` | Se inyecta **solo en ese origen** al empezar y al terminar de cargar cada página; los mensajes del canal solo se atienden si la página actual es de ese origen. El adaptador de la PWA está en `js/generador.js` (`nativo()`). |
| Instalación del modelo | Automática al abrir la app (ver abajo). Barra delgada arriba con el estado: «Descargando la IA local… 34 %», «IA local lista». |
| Ajustes ocultos | **Mantén pulsada la barra de estado** (o la franja verde de 4 px cuando está oculta): modelo, pausar o reintentar la descarga, importar un GGUF, borrar, hilos, recargar la página y una prueba de velocidad con JSON de resultados (tiempos, tokens/s, RAM, batería). |

## Reglas que se mantienen (AGENTS.md)
- **Cero red durante el uso normal.** La app solo se conecta para abrir la PWA la primera vez, para descargar el modelo una vez y
  para la sincronización de la PWA en las estaciones (`js/sync.js`). El LLM **nunca** corre en la nube.
- **El modelo solo reescribe respuestas.** El carril crítico y el verificador corren en la PWA (`js/carril.js`,
  `js/verificador.js`); `js/generador.js` solo llama a `FrayNativo.generar` para `r.tipo === 'respuesta'`. Como defensa extra,
  el lado nativo rechaza sin llamar al modelo un `fichaId` de una categoría crítica (`lib/critico.dart`: ids del carril y
  fichas bloqueadas de alerta del volcán y salud) o un `tipo` distinto de `respuesta`. **No hay catálogo propio de fichas**:
  las fichas nuevas que llegan por sync se pueden reescribir.
- **Verificador nativo** (`lib/verificador.dart`): cifras, cifra+unidad y nombres propios deben estar en la fuente; nada de
  «comestible», «tóxico» ni alertas del volcán. La PWA vuelve a verificar con `js/verificador.js` y, si falla, deja la frase
  del guion.

## Instalación automática del modelo
1. Al abrir la app se busca el GGUF del modelo elegido en la memoria privada de la app. Si está (verificado una vez con
   SHA-256), se **precarga** y se calienta el prompt del sistema: la primera pregunta ya no paga la carga.
2. Si no está, y alguien lo copió con adb a la carpeta de importación, se verifica (tamaño + SHA-256) y se usa ahí mismo.
3. Si no, **se descarga solo** desde Hugging Face (`resolve/main`) en cuanto hay señal: barra de progreso, **reanudable**
   (HTTP Range: si se corta o se cierra la app, sigue donde iba), reintentos solos (10 s, 20 s, 40 s… hasta 2 min, y al volver
   a la app), verificación de tamaño y SHA-256, y queda en la memoria privada de la app (se borra al desinstalar).
4. Mientras no esté, Fray responde igual con el texto del guion (respuesta extractiva) y la barra dice «Descargando la IA
   local…». Si la descarga termina con la app abierta, la barra dice «IA local lista. Toca aquí para activarla» (recarga la
   página para que la PWA empiece a usarla).

`FrayNativo.estado()` responde `listo: true` cuando el modelo está instalado y cargado **o cargándose** (`cargando: true`):
`generar` espera la precarga dentro de su `timeoutMs`. Así la PWA, que pregunta una vez al arrancar, no se queda sin IA por
llegar antes que la precarga. También devuelve `instalacion: {estado, modelo, hecho, total}`.

### Modelos (`assets/modelo.json`)
| Modelo | Archivo | Tamaño | Licencia | Uso |
|---|---|---|---|---|
| **Qwen3.5-0.8B-Instruct Q4_K_M** (por defecto) | `Qwen3.5-0.8B-Q4_K_M.gguf` (unsloth/Qwen3.5-0.8B-GGUF) | 533 MB | Apache-2.0 | Cualquier teléfono con 4 GB de RAM o más. Con el contenido real: 25/28 correctas, 0,48 s a la primera palabra en PC. |
| Qwen3.5-2B-Instruct Q4_K_M | `Qwen3.5-2B-Q4_K_M.gguf` (unsloth/Qwen3.5-2B-GGUF) | 1,28 GB | Apache-2.0 | Gama alta (8 GB de RAM o más), desde los ajustes ocultos. |

`sha256` y `bytes` salen de `huggingface_hub` (`model_info(files_metadata=True)`, `lfs.sha256`):
`python nativo/herramientas/huella_hf.py <repo> <archivo>` imprime la entrada lista.

**Cambiar el modelo sin recompilar:** edita una copia de `assets/modelo.json` (por ejemplo `porDefecto`) y cópiala al teléfono:
```bash
adb push modelo.json /sdcard/Android/data/co.fray.paramo/files/modelo.json
```
La app la lee al abrir (si no es válida, usa la suya). En los ajustes ocultos aparece «modelo.json reemplazado».

### Importar el GGUF sin señal
- **adb:** `adb push Qwen3.5-0.8B-Q4_K_M.gguf /sdcard/Android/data/co.fray.paramo/files/` y abre la app (la carpeta existe
  después de abrirla una vez). Se verifica y se usa en ese lugar (no se duplica).
- **USB / archivo:** ajustes ocultos → «Importar GGUF desde archivo». Se reconoce por tamaño y SHA-256 y se copia a la memoria
  privada de la app.

### Parámetros del motor
`n_ctx` 2048 · hilos = núcleos grandes (leídos de `/sys/.../cpuinfo_max_freq`, entre 2 y 4; 4 si no se puede leer; se cambia en
los ajustes ocultos o con `motor.hilos` en `modelo.json`) · temperatura 0 (top-k 1) · `maxTokens` 70 · `timeoutMs` 6000 · solo
CPU · sin razonamiento en Qwen3.5 (`enableThinking: false`) · prompt del sistema idéntico a `SISTEMA` de `js/generador.js`
(`assets/laboratorio.json`; si cambias uno, cambia el otro) y cacheado: llamadart reutiliza el prefijo (`reusePromptPrefix`) y la
app lo procesa una vez al cargar.

## Puente `window.FrayNativo` (versión 1)
```js
window.FrayNativo = {
  version: 1,
  estado(): Promise<{ listo, cargando, modelo, motor: 'llama.cpp', backend: 'cpu', cargaMs?, instalacion }>,
  generar({ id, pregunta, idioma: 'es'|'en', fichaId, contexto, maxTokens = 70, timeoutMs = 6000, tipo? }):
    Promise<{ id, texto, ok /*pasó el verificador nativo*/, fallas, primeraPalabraMs, totalMs, tokens, cortado, rechazado?: 'critica' }>,
  cancelar(id): void
}
// Streaming: window.dispatchEvent(new CustomEvent('fray-nativo', { detail: { id, trozo } }))
```
- `generar` nunca rechaza la promesa: los problemas van en `fallas`. Sin modelo responde `ok: false` y `texto: ''`.
- Para depurar la PWA dentro del APK: `chrome://inspect` en el PC con el teléfono por USB.

## Compilar
Requisitos: Flutter 3.44+ (probado con 3.44.7), Android SDK con NDK 28 y CMake, JDK 17+ (probado con Temurin 25). En Windows,
**compila fuera de OneDrive y en una ruta corta** (por ejemplo `C:\wt2\apk`), con `git config core.longpaths true`.
```bash
cd nativo
flutter pub get
flutter test                                      # verificador (paridad) y defensa del carril crítico
flutter build apk --release --target-platform android-arm64
# APK: nativo/build/app/outputs/flutter-apk/app-release.apk (firmado con la clave de debug: sirve para probar)
```
- Solo `arm64-v8a` y solo llama.cpp en CPU (`hooks.user_defines.llamadart` en `pubspec.yaml`: sin LiteRT-LM ni Vulkan) y las
  bibliotecas nativas comprimidas (`useLegacyPackaging`): así el APK baja de 173 MB (25-nov) a menos de 95 MB.
- La primera compilación descarga los binarios de llama.cpp (build hook de llamadart, desde GitHub).
- `permission_handler` está en 12.x a propósito: la 13 pide compileSdk 37 y AGP 9.0 no lo encuentra.

## Instalar y probar
```bash
adb install -r fray-paramo-arm64.apk
adb shell monkey -p co.fray.paramo 1                      # abrir (con señal la primera vez)
adb logcat -s flutter                                     # mensajes de la app
adb shell dumpsys battery | grep level                    # batería antes y después
adb shell cmd connectivity airplane-mode enable           # modo avión (o desde el teléfono)
```
Prueba: abrir con señal → esperar «IA local lista» (533 MB) → modo avión → cerrar y abrir → preguntar 3 cosas en una estación
(la respuesta con IA lleva la marca «IA»). Los tiempos se ven en los ajustes ocultos → «Prueba de velocidad» o en
`chrome://inspect` (consola de la PWA).

En el teléfono hay que permitir «instalar apps de orígenes desconocidos» para el navegador o para adb.

## Qué falta para iPhone
iPhone sigue con la PWA (respuesta extractiva). Para un IPA haría falta una Mac con Xcode y una cuenta de Apple Developer.

## Licencias
| Componente | Licencia |
|---|---|
| llamadart | MIT |
| llama.cpp (vía llamadart-native) | MIT |
| Flutter, webview_flutter, image_picker, battery_plus, device_info_plus, path_provider, crypto | BSD-3-Clause |
| permission_handler, file_picker | MIT |
| Qwen3.5-0.8B / Qwen3.5-2B (GGUF de unsloth) | Apache-2.0 |

Los modelos no van en el APK ni en el repo: se descargan o se importan en el teléfono.

## Archivos
| Archivo | Qué es |
|---|---|
| `lib/main.dart` | Pantalla única: barra de estado de la IA + WebView |
| `lib/app_web.dart` | WebView, origen permitido, inyección del puente, permisos, selector de archivos, aviso sin señal |
| `lib/instalador.dart` | Instalación automática: revisar, importar, descargar (reintentos) y precargar |
| `lib/modelos.dart` | Catálogo (`modelo.json`), descarga reanudable, importación y SHA-256 |
| `lib/motor.dart` | Carga, calentamiento del prompt y generación con llamadart (cola, tiempo máximo, cancelar) |
| `lib/puente.dart` | `window.FrayNativo` y prompts |
| `lib/critico.dart` | Defensa extra: fichas de categorías críticas que nunca van al modelo |
| `lib/verificador.dart` | Verificador determinista |
| `lib/ajustes.dart` | Ajustes ocultos y prueba de velocidad |
| `assets/modelo.json` · `assets/laboratorio.json` | Modelos y motor · prompt del sistema y preguntas de prueba |
| `herramientas/huella_hf.py` | Tamaño y SHA-256 de un archivo de Hugging Face para `modelo.json` |
