#!/usr/bin/env bash
# Arranca el modelo local de Fray en Linux x86_64 o ARM64 (Raspberry Pi 4/5, mini PC, laptop): llama-server en 127.0.0.1:8080.
#
#   bash servidor/iniciar.sh preparar [modelo]   # CON INTERNET, una vez: binario (descarga o compila) + GGUF con SHA-256
#   bash servidor/iniciar.sh [modelo]            # SIN RED: arranca el servidor (modelo por defecto: auto según RAM)
#   APP=. bash servidor/iniciar.sh               # además sirve la app estática en http://127.0.0.1:8080/
#
# Modelos: q25-1.5b (Qwen2.5-1.5B Q4_K_M, 1,12 GB) · q35-2b (Qwen3.5-2B Q4_K_M, 1,28 GB) · q25-0.5b (0,49 GB, para 2 GB de RAM)
# Variables: RAIZ (por defecto ~/espeletia-llm), HILOS (por defecto núcleos físicos), PUERTO (8080), CTX (2048), COMPILAR=1.
set -euo pipefail
BUILD=b12738
RAIZ="${RAIZ:-$HOME/espeletia-llm}"
PUERTO="${PUERTO:-8080}"
CTX="${CTX:-2048}"

accion=arrancar
if [ "${1:-}" = preparar ]; then accion=preparar; shift; fi
modelo="${1:-auto}"

ram_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$modelo" = auto ]; then
  if [ "$ram_mb" -ge 3500 ]; then modelo=q25-1.5b; else modelo=q25-0.5b; fi
fi
case "$modelo" in
  q25-1.5b) repo=Qwen/Qwen2.5-1.5B-Instruct-GGUF; archivo=qwen2.5-1.5b-instruct-q4_k_m.gguf; sha=6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e ;;
  q35-2b)   repo=unsloth/Qwen3.5-2B-GGUF;          archivo=Qwen3.5-2B-Q4_K_M.gguf;            sha=aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223 ;;
  q35-0.8b) repo=unsloth/Qwen3.5-0.8B-GGUF;         archivo=Qwen3.5-0.8B-Q4_K_M.gguf;          sha=bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517 ;;
  q25-0.5b) repo=Qwen/Qwen2.5-0.5B-Instruct-GGUF; archivo=qwen2.5-0.5b-instruct-q4_k_m.gguf; sha=74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db ;;
  *) echo "Modelo desconocido: $modelo (usa q35-0.8b, q25-1.5b, q35-2b o q25-0.5b)"; exit 1 ;;
esac
gguf="$RAIZ/gguf/$modelo/$archivo"
bin="$RAIZ/bin/llama-$BUILD"

case "$(uname -m)" in
  x86_64|amd64) tgz=llama-$BUILD-bin-ubuntu-x64.tar.gz; tgzsha=e37941d22b599d528410c81f17d84b6586a2d82ecb2f4840cebc8b83ad9f8fcd ;;
  aarch64|arm64) tgz=llama-$BUILD-bin-ubuntu-arm64.tar.gz; tgzsha=e62e0923f327a40dbcf9cb8a7ef31998c445f12d919bc9af786a28c303daa3ef ;;
  *) tgz=""; tgzsha="" ;;
esac

servidor_bin() {  # el binario puede quedar en $bin, $bin/bin o $bin/build/bin según la vía
  for c in "$bin/llama-server" "$bin/bin/llama-server" "$bin/build/bin/llama-server" "$(command -v llama-server 2>/dev/null || true)"; do
    if [ -n "$c" ] && [ -x "$c" ]; then echo "$c"; return; fi
  done
}

compilar() {
  echo "Compilando llama.cpp $BUILD (Pi 5: ~10-15 min; Pi 4: ~25 min)…"
  command -v cmake >/dev/null || { echo "Falta cmake: sudo apt install -y git cmake build-essential"; exit 1; }
  rm -rf "$bin" && git clone --depth 1 --branch "$BUILD" https://github.com/ggml-org/llama.cpp "$bin"
  cmake -S "$bin" -B "$bin/build" -DCMAKE_BUILD_TYPE=Release -DLLAMA_CURL=OFF -DGGML_NATIVE=ON
  cmake --build "$bin/build" --config Release -j "$(nproc)" --target llama-server llama-bench
}

if [ "$accion" = preparar ]; then
  mkdir -p "$RAIZ/bin" "$(dirname "$gguf")"
  if [ -z "$(servidor_bin)" ]; then
    if [ "${COMPILAR:-0}" = 1 ] || [ -z "$tgz" ]; then compilar
    else
      echo "Bajando $tgz…"
      curl -fL -o "$RAIZ/bin/$tgz" "https://github.com/ggml-org/llama.cpp/releases/download/$BUILD/$tgz"
      echo "$tgzsha  $RAIZ/bin/$tgz" | sha256sum -c -
      mkdir -p "$bin" && tar -xzf "$RAIZ/bin/$tgz" -C "$bin" --strip-components=1 || tar -xzf "$RAIZ/bin/$tgz" -C "$bin"
      s="$(servidor_bin)"
      if [ -z "$s" ] || ! LD_LIBRARY_PATH="$(dirname "$s"):${LD_LIBRARY_PATH:-}" "$s" --version >/dev/null 2>&1; then
        echo "El binario descargado no corre aquí (glibc vieja, p. ej. Raspberry Pi OS 12). Compilando…"; compilar
      fi
    fi
  fi
  [ -f "$gguf" ] || { echo "Bajando $archivo…"; curl -fL -o "$gguf" "https://huggingface.co/$repo/resolve/main/$archivo"; }
  echo "$sha  $gguf" | sha256sum -c -
  echo "Listo. Ya puedes desconectar la red: bash servidor/iniciar.sh $modelo"
  exit 0
fi

s="$(servidor_bin)"
[ -n "$s" ] || { echo "No hay llama-server en $bin. Corre una vez: bash servidor/iniciar.sh preparar $modelo"; exit 1; }
[ -f "$gguf" ] || { echo "No está $gguf. Corre: bash servidor/iniciar.sh preparar $modelo"; exit 1; }
if [ "${SIN_VERIFICAR:-0}" != 1 ]; then echo "Verificando SHA-256…"; echo "$sha  $gguf" | sha256sum -c - >/dev/null; fi

if [ -z "${HILOS:-}" ]; then  # núcleos físicos (en la Pi = nproc; en x86 con hyperthreading, la mitad)
  HILOS=$(lscpu -p=CORE,SOCKET 2>/dev/null | awk '!/^#/' | sort -u | wc -l || true)
  [ "$HILOS" -ge 1 ] 2>/dev/null || HILOS=$(nproc)
fi
extra=(--no-webui)
[ -n "${APP:-}" ] && extra=(--path "$(cd "$APP" && pwd)")
echo "llama-server $modelo · $HILOS hilos · contexto $CTX · RAM ${ram_mb} MB · http://127.0.0.1:$PUERTO"
echo "Prueba: curl http://127.0.0.1:$PUERTO/health   ·   Ctrl+C para parar"
export LD_LIBRARY_PATH="$(dirname "$s"):${LD_LIBRARY_PATH:-}"
exec "$s" -m "$gguf" -t "$HILOS" -c "$CTX" -np 1 -ngl 0 --host 127.0.0.1 --port "$PUERTO" --jinja "${extra[@]}"
