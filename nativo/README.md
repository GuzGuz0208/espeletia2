# Álbum del Páramo para Android (Flutter)

APK Android que **envuelve la misma PWA** en un WebView y le agrega un **LLM nativo** (llama.cpp o LiteRT-LM vía
[llamadart](https://pub.dev/packages/llamadart)). Decisión: [docs/decisiones/2026-11-25-apk-android-llm-nativo.md](../docs/decisiones/2026-11-25-apk-android-llm-nativo.md).

Tiene dos pestañas:

| Pestaña | Qué hace |
|---|---|
| **App** | La PWA de siempre, servida **desde la propia app** en `http://127.0.0.1:8735` (sin red desde el primer arranque). Le inyecta el puente `window.FrayNativo`. Concede cámara, micrófono y GPS cuando la página los pide. |
| **Laboratorio** | Descarga o importa un modelo, lo carga en CPU o GPU y corre las 5 preguntas de [laboratorio/prueba-llm-nativo.md](../laboratorio/prueba-llm-nativo.md). Mide y copia los resultados en JSON. |

`nativo/` **no es parte de la PWA**: no está en la lista `APP` de `sw.js` ni la usa el sitio. La PWA sigue siendo la misma
para iPhone y para cualquier navegador; si `window.FrayNativo` no existe, sigue en modo Básico.

## Reglas que se mantienen (AGENTS.md)
- **El carril crítico nunca llega al modelo.** El lado nativo rechaza (`rechazado: 'critica'`) sin llamar al LLM si la ficha es
  `emergencia`, `mal_altura`, `comer_plantas`, `volcan_estado`, `servicios`, o si en `chat.json` es urgente o de abstención.
  Una ficha que no existe en `chat.json` también se rechaza (falla cerrado). Ver `lib/critico.dart`.
- **Verificador determinista** (`lib/verificador.dart`, portado de `laboratorio/slm.html`): cifras, cifra+unidad y nombres
  propios deben estar en la fuente; nada de «comestible», «tóxico» ni alertas del volcán; no responder con pregunta ni esquivar.
- **Cero red en ejecución** para la PWA: se sirve desde los assets del APK. La única conexión es la descarga del modelo, a mano y
  con wifi, desde el Laboratorio.

## Compilar
Requisitos: Flutter 3.44+ (probado con 3.44.7), Android SDK con NDK y CMake, JDK 17+ (probado con Temurin 25). En Windows,
**compila fuera de OneDrive y en una ruta corta** (por ejemplo `C:\wt\nativo`), con `git config core.longpaths true`.

```bash
# desde la raíz del repo
python nativo/herramientas/copiar_pwa.py          # copia la PWA (lista APP de sw.js + models/partes) a nativo/assets/pwa/
cd nativo
flutter pub get
flutter test                                      # verificador (paridad con slm.html) y carril crítico
flutter build apk --release --target-platform android-arm64
# el APK queda en nativo/build/app/outputs/flutter-apk/app-release.apk (firmado con la clave de debug: sirve para probar)
```

- `assets/pwa/` es un espejo generado y está en `.gitignore`: **no se commitea**. Si cambias la PWA, vuelve a correr el script.
  Si aparece un archivo nuevo en la PWA y no entra al APK, borra la caché de assets de Flutter:
  `rm -rf .dart_tool/flutter_build build/app/intermediates/flutter` (sin `flutter clean`, que obliga a bajar otra vez llama.cpp).
- El APK de release lleva solo `arm64-v8a` (ver `android/app/build.gradle.kts`).
- La primera compilación descarga los binarios de llama.cpp y LiteRT-LM (build hook de llamadart, desde GitHub).
- `permission_handler` está en 12.x a propósito: la 13 usa `permission_handler_android` 14, que pide compileSdk 37 y AGP 9.0
  no lo encuentra.

## Instalar
```bash
adb install -r app-release.apk
```
En el teléfono hay que permitir «instalar apps de orígenes desconocidos» para el explorador de archivos o para adb.

## Cargar un modelo
La lista está en `assets/modelos.json` (nombre, archivo, url de Hugging Face, sha256, bytes, licencia, motor). El tamaño y la
huella salen de la API de Hugging Face: `python herramientas/huella_hf.py <repo> <archivo>` imprime la entrada lista.

| Modelo | Archivo | Tamaño | Motor | Licencia |
|---|---|---|---|---|
| Qwen2.5-0.5B-Instruct Q4_K_M (prueba de humo) | `qwen2.5-0.5b-instruct-q4_k_m.gguf` | 0,49 GB | llama.cpp | Apache-2.0 |
| Qwen2.5-1.5B-Instruct Q4_K_M | `qwen2.5-1.5b-instruct-q4_k_m.gguf` | 1,12 GB | llama.cpp | Apache-2.0 |
| Qwen3.5-0.8B Q4_K_M (unsloth) | `Qwen3.5-0.8B-Q4_K_M.gguf` | 0,53 GB | llama.cpp | Apache-2.0 |
| Qwen3.5-2B Q4_K_M (unsloth) | `Qwen3.5-2B-Q4_K_M.gguf` | 1,28 GB | llama.cpp | Apache-2.0 |
| Gemma 4 E2B | `gemma-4-E2B-it.litertlm` | 2,59 GB | LiteRT-LM | Apache-2.0 |

Dos formas:
1. **Descargar (wifi):** botón «Descargar» en el Laboratorio. Va a la memoria privada de la app y se verifica tamaño y SHA-256.
2. **Importar con adb** (sin wifi en el teléfono):
   ```bash
   adb push qwen2.5-1.5b-instruct-q4_k_m.gguf /sdcard/Android/data/co.espeletia.album_paramo/files/
   ```
   y en el Laboratorio, «Importar (adb)». Se verifica tamaño y SHA-256 y se usa en ese mismo lugar (no se duplica).
   La carpeta existe después de abrir la app una vez. Se borra al desinstalar la app.

Luego: elegir el modelo, CPU o GPU, hilos (4 por defecto), «1. Cargar», «2. Correr las 5 preguntas» y «Copiar resultados (JSON)».
El JSON lleva el modelo del teléfono, el backend pedido y el **backend real**, la carga, la primera palabra, el total, los tokens,
tokens/s, la RAM del proceso y la batería antes/después. En Qwen3/3.5 y Gemma 4 se desactiva el razonamiento (`enableThinking: false`).

GPU: en GGUF es Vulkan (experimental en Android según llamadart; en Mali puede ir más lento o fallar). En `.litertlm` es el
delegado GPU de LiteRT-LM (necesita la OpenCL del fabricante, declarada como opcional en el manifiesto). Si la GPU falla, carga en
CPU y lo avisa; el backend real queda en pantalla y en el JSON.

## Puente `window.FrayNativo` (versión 1)
```js
window.FrayNativo = {
  version: 1,
  estado(): Promise<{ listo, modelo, motor: 'llama.cpp'|'litert-lm', backend: 'cpu'|'gpu', cargaMs? }>,
  generar({ id, pregunta, idioma: 'es'|'en', fichaId, contexto, maxTokens = 60, timeoutMs = 4000 }):
    Promise<{ id, texto, ok /*pasó el verificador*/, fallas, primeraPalabraMs, totalMs, tokens, cortado, rechazado?: 'critica' }>,
  cancelar(id): void
}
// Streaming: window.dispatchEvent(new CustomEvent('fray-nativo', { detail: { id, trozo } }))
```
- Usa el modelo que esté cargado (se carga desde el Laboratorio). Sin modelo, `generar` responde `ok: false` con
  `fallas: ['modelo no cargado']`.
- `ok` es `false` también si el modelo se abstuvo («No tengo esa información oficial…»), si se cortó por tiempo o por límite, o
  si hubo un error: en todos esos casos la PWA deja la frase oficial.
- `generar` nunca rechaza la promesa: los problemas van en `fallas`.
- El script del puente se sirve como `__fray_nativo.js` y se inyecta en `index.html` al servirlo (el archivo del repo no cambia).
- Para depurar la PWA dentro del APK: `chrome://inspect` en el PC con el teléfono por USB.

## Qué falta para iPhone
iPhone sigue con la PWA (modo Básico). Para un IPA haría falta una Mac con Xcode, una cuenta de Apple Developer y firma.
El código es Flutter y llamadart soporta iOS (deployment target 16.4, paquetes `llamadart_llama_cpp_flutter` y
`llamadart_litert_lm_flutter` por Swift Package Manager), pero la plataforma `ios/` no se generó ni se probó.

## Licencias
| Componente | Licencia |
|---|---|
| llamadart | MIT |
| llama.cpp (vía llamadart-native) | MIT |
| LiteRT-LM | Apache-2.0 |
| Flutter, webview_flutter, image_picker, battery_plus, device_info_plus, path_provider, crypto | BSD-3-Clause |
| permission_handler, file_picker | MIT |
| Qwen2.5-0.5B / 1.5B-Instruct (GGUF de Qwen) | Apache-2.0 |
| Qwen3.5-0.8B / 2B (GGUF de unsloth) | Apache-2.0 |
| Gemma 4 E2B (litert-community) | Apache-2.0 |

Los modelos no van en el APK ni en el repo: se descargan o se importan en el teléfono.

## Archivos
| Archivo | Qué es |
|---|---|
| `lib/main.dart` | Las dos pestañas |
| `lib/laboratorio.dart` | Pantalla de laboratorio y JSON de resultados |
| `lib/motor.dart` | Carga y generación con llamadart (cola, tiempo máximo, cancelar) |
| `lib/modelos.dart` | Catálogo, descarga, importación y SHA-256 |
| `lib/verificador.dart` | Verificador determinista (paridad con `laboratorio/slm.html`) |
| `lib/critico.dart` | Fichas que nunca van al modelo |
| `lib/puente.dart` | `window.FrayNativo` y prompts |
| `lib/servidor.dart` | Servidor local de la PWA (une `models/partes/` al vuelo e inyecta el puente) |
| `lib/app_web.dart` | WebView, permisos y selector de archivos |
| `assets/modelos.json` · `assets/laboratorio.json` | Modelos · preguntas, prompt del sistema y ejemplos |
| `herramientas/copiar_pwa.py` | Copia la PWA a `assets/pwa/` antes de compilar |
| `herramientas/paridad_verificador.mjs` | Corre los casos de `test/casos_verificador.json` contra el `verificar()` de `slm.html` |
| `herramientas/huella_hf.py` | Tamaño y SHA-256 de un archivo de Hugging Face para `modelos.json` |
