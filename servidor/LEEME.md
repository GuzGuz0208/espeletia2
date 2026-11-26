# Modelo local de Fray: cómo arrancarlo en cualquier dispositivo

El modelo generativo es **opcional**: la app responde siempre con el texto del guion (búsqueda en el navegador). Si hay un
`llama-server` en `127.0.0.1:8080`, `js/generador.js` lo usa para reescribir la respuesta en tono de guía; el verificador la revisa
y, si falla o tarda más de `timeoutMs`, queda el texto del guion. **Sin red en la demostración**: solo `127.0.0.1`.

Dos fases:
1. **Preparar (con internet, una vez, antes de subir):** baja el binario de llama.cpp **b12738** y el GGUF, y verifica SHA-256.
2. **Arrancar (sin red):** `llama-server` con `-t` = núcleos físicos, `-c 2048`, `-np 1`, `--host 127.0.0.1 --port 8080`.

## Qué modelo según la RAM

| RAM del dispositivo | Modelo | Archivo GGUF | Tamaño | SHA-256 |
|---|---|---|---|---|
| ≥ 4 GB (recomendado) | **Qwen2.5-1.5B-Instruct Q4_K_M** (`q25-1.5b`, por defecto: más rápido) | `qwen2.5-1.5b-instruct-q4_k_m.gguf` (repo `Qwen/Qwen2.5-1.5B-Instruct-GGUF`) | 1,12 GB | `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e` |
| ≥ 4 GB y CPU rápida | **Qwen3.5-2B Q4_K_M** (`q35-2b`: mejor calidad, más lento) | `Qwen3.5-2B-Q4_K_M.gguf` (repo `unsloth/Qwen3.5-2B-GGUF`) | 1,28 GB | `aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223` |
| **Celular gama media / 2-3 GB** | **Qwen3.5-0.8B Q4_K_M** (`q35-0.8b`: recomendado para el celular, ver pruebas/resultados-modelos-guion.md) | `Qwen3.5-0.8B-Q4_K_M.gguf` (repo `unsloth/Qwen3.5-0.8B-GGUF`) | 0,53 GB | `bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517` |
| 2 GB | Qwen2.5-0.5B-Instruct Q4_K_M (`q25-0.5b`, **sin evaluar en calidad**) | `qwen2.5-0.5b-instruct-q4_k_m.gguf` (repo `Qwen/Qwen2.5-0.5B-Instruct-GGUF`) | 0,49 GB | `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db` |
| < 2 GB | sin modelo generativo: la app responde con el texto del guion (extractivo) | — | — | — |

SHA-256 tomados de `C:\Users\danna\espeletia-llm\gguf\registro.json` (descargas verificadas el 25-nov). En el PC del equipo los
GGUF ya están en `%USERPROFILE%\espeletia-llm\gguf\<modelo>\` y el binario en `%USERPROFILE%\espeletia-llm\bin\llama-b12738\`:
**copiar esa carpeta `espeletia-llm` (con `bin` y `gguf/<modelo>`) en una USB es la vía más rápida a cualquier dispositivo**.

Binarios oficiales de llama.cpp b12738 (github.com/ggml-org/llama.cpp/releases/tag/b12738):

| Plataforma | Archivo | SHA-256 |
|---|---|---|
| Windows x64 | `llama-b12738-bin-win-cpu-x64.zip` | `9628c89dee398631ea70cadcde904e7c8eb0b411415e4188e08bc8ab99c628a1` |
| Windows ARM64 | `llama-b12738-bin-win-cpu-arm64.zip` | `b5086b984d2e5988fed46dcd5caf972d8735097cc3d4f54e56e94937633995f4` |
| Linux x86_64 | `llama-b12738-bin-ubuntu-x64.tar.gz` | `e37941d22b599d528410c81f17d84b6586a2d82ecb2f4840cebc8b83ad9f8fcd` |
| Linux ARM64 (Raspberry Pi 4/5 con SO de 64 bits) | `llama-b12738-bin-ubuntu-arm64.tar.gz` | `e62e0923f327a40dbcf9cb8a7ef31998c445f12d919bc9af786a28c303daa3ef` |
| Android ARM64 (Termux) | `llama-b12738-bin-android-arm64.tar.gz` | `9de32e0a0fd8bae0bfed1bd9f59d4246f3aa11c926ad0bc6569a0c053f5e6e92` |

## Windows (laptop, mini PC, tableta Windows)
```powershell
cd <repo>
# con internet, una vez (si no copiaste espeletia-llm por USB):
powershell -ExecutionPolicy Bypass -File servidor\iniciar.ps1 -Preparar
# sin red:
powershell -ExecutionPolicy Bypass -File servidor\iniciar.ps1                  # Qwen2.5-1.5B
powershell -ExecutionPolicy Bypass -File servidor\iniciar.ps1 -Modelo q35-2b   # Qwen3.5-2B
powershell -ExecutionPolicy Bypass -File servidor\iniciar.ps1 -App .           # y sirve la app en http://127.0.0.1:8080/
```
Opciones: `-Raiz <carpeta espeletia-llm>`, `-Hilos N`, `-Puerto 8080`, `-SinVerificar` (salta el SHA-256 al arrancar, ~5 s menos).

## Linux x86_64 o ARM64 (Raspberry Pi 4/5, mini PC, laptop)
```bash
cd <repo>
bash servidor/iniciar.sh preparar            # con internet, una vez; modelo auto según RAM (≥3,5 GB → q25-1.5b; si no, q25-0.5b)
bash servidor/iniciar.sh preparar q35-2b     # otro modelo
bash servidor/iniciar.sh                     # sin red: arranca
APP=. bash servidor/iniciar.sh               # y sirve la app en http://127.0.0.1:8080/
```
Dos vías para el binario (las hace `preparar`):
- **Descarga** del binario oficial (`ubuntu-x64` o `ubuntu-arm64`), verificado por SHA-256. Funciona en Ubuntu 22.04+ y Debian 13.
- **Compilación** si el binario no corre (p. ej. Raspberry Pi OS 12 «bookworm» tiene glibc 2.36, más vieja que la del binario) o
  con `COMPILAR=1`: `sudo apt install -y git cmake build-essential` y el script compila `llama-server` y `llama-bench` con
  `-DGGML_NATIVE=ON` (Pi 5: ~10-15 min; Pi 4: ~25 min, estimado). A mano:
  ```bash
  git clone --depth 1 --branch b12738 https://github.com/ggml-org/llama.cpp ~/espeletia-llm/bin/llama-b12738
  cd ~/espeletia-llm/bin/llama-b12738
  cmake -B build -DCMAKE_BUILD_TYPE=Release -DLLAMA_CURL=OFF -DGGML_NATIVE=ON
  cmake --build build -j$(nproc) --target llama-server llama-bench
  ```
Raspberry Pi: usar **SO de 64 bits**, disipador activo (a 4 hilos la Pi 5 se calienta y baja la frecuencia sin ventilador) y
fuente oficial de 5 V / 5 A. Variables: `RAIZ`, `HILOS`, `PUERTO`, `CTX`, `SIN_VERIFICAR=1`.

## Android (teléfono o tableta)
- **Plan A — APK nativa (ya compilada):** `C:\wt\apk\album-paramo-nativo-arm64.apk` (app Flutter con llamadart, rama
  `r3/app-nativa` del repo anterior). Instalar con `adb install -r C:\wt\apk\album-paramo-nativo-arm64.apk` o copiándola al
  teléfono. Corre el GGUF dentro de la app, sin servidor. Es la interfaz anterior (Álbum del Páramo): sirve para demostrar el modelo
  en el dispositivo, no la pantalla nueva de Fray.
- **Plan B — Termux + llama-server + navegador** (misma app web que en el PC):
  ```bash
  # en Termux (instalado desde F-Droid), con internet, una vez:
  pkg update && pkg install -y python curl
  curl -LO https://github.com/ggml-org/llama.cpp/releases/download/b12738/llama-b12738-bin-android-arm64.tar.gz
  echo "9de32e0a0fd8bae0bfed1bd9f59d4246f3aa11c926ad0bc6569a0c053f5e6e92  llama-b12738-bin-android-arm64.tar.gz" | sha256sum -c
  mkdir -p ~/espeletia-llm/bin && tar -xzf llama-b12738-bin-android-arm64.tar.gz -C ~/espeletia-llm/bin
  # copiar el GGUF a ~/espeletia-llm/gguf/q25-1.5b/ (termux-setup-storage y luego cp desde ~/storage/downloads)
  # sin red:
  cd ~/espeletia-llm/bin/llama-b12738 && LD_LIBRARY_PATH=. ./llama-server -m ~/espeletia-llm/gguf/q25-1.5b/qwen2.5-1.5b-instruct-q4_k_m.gguf \
     -t 4 -c 2048 -np 1 --host 127.0.0.1 --port 8080 --path ~/repo
  ```
  Luego abrir `http://127.0.0.1:8080/` en Chrome. En teléfonos usar `-t 4` (núcleos grandes), no todos.
  Si el tar no trae `llama-server` ejecutable, alternativa: `pkg install llama-cpp` (paquete de Termux; versión distinta a b12738).

## Servir la app estática (sin red)
- **Con el propio llama-server** (un solo proceso, mismo origen): `-App .` / `APP=.` / `--path <repo>` → `http://127.0.0.1:8080/`.
  `js/generador.js` usa `http://127.0.0.1:8080` por defecto; si la app se sirve desde ahí, todo es mismo origen.
- **Con Python**: `python -m http.server 8000 --bind 127.0.0.1` en la raíz del repo → `http://127.0.0.1:8000/`. llama-server
  responde con CORS abierto, así que la app en :8000 puede llamar a :8080 (solo en la máquina local).

## Comprobar y medir
```bash
curl http://127.0.0.1:8080/health                         # {"status":"ok"}
node pruebas/generador.prueba.mjs                         # 5 preguntas de extremo a extremo (si hay node)
bash herramientas/bench_dispositivo.sh [modelo]           # Linux: UN comando, guarda pruebas/bench-<host>-<fecha>.txt
powershell -ExecutionPolicy Bypass -File herramientas\bench_dispositivo.ps1 [-Modelo q25-1.5b]   # Windows
```
El bench imprime tokens/s de llama-bench (`pp64`, `pp256`, `tg48`), primera palabra y total de 5 preguntas, RAM y (Linux)
temperatura. Con esos números se ajusta `timeoutMs` de `generador.reescribir` (regla: primera palabra mediana × 1,5 + 70 tokens / tg).

## Parámetros fijos de la llamada (js/generador.js)
`temperature 0`, `top_k 1`, `max_tokens 70`, `cache_prompt true`, `chat_template_kwargs {enable_thinking:false}`, streaming. El
prompt del sistema es fijo (queda en caché: solo se procesan ~40-60 tokens nuevos por pregunta). La pregunta del visitante va en el
mensaje de usuario como dato; si contiene «ignora», «system», «prompt», «instrucciones»… no se genera.
