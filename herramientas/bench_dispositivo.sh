#!/usr/bin/env bash
# Mide el modelo local en el dispositivo (Linux x86/ARM64, Raspberry Pi). UN SOLO COMANDO, sin red:
#   bash herramientas/bench_dispositivo.sh [modelo]          # modelo: q25-1.5b (defecto) | q35-2b | q25-0.5b
# Requiere haber corrido antes (con internet) bash servidor/iniciar.sh preparar [modelo].
# Imprime: llama-bench (-p 64,256 -n 48), 5 preguntas de extremo a extremo (primera palabra y total), RAM y temperatura.
# Guarda todo en pruebas/bench-<host>-<fecha>.txt para pegarlo en el informe.
set -uo pipefail
cd "$(dirname "$0")/.."
RAIZ="${RAIZ:-$HOME/espeletia-llm}"; BUILD=b12738; PUERTO="${PUERTO:-8080}"
modelo="${1:-q25-1.5b}"
case "$modelo" in
  q25-1.5b) archivo=qwen2.5-1.5b-instruct-q4_k_m.gguf ;;
  q35-2b) archivo=Qwen3.5-2B-Q4_K_M.gguf ;;
  q25-0.5b) archivo=qwen2.5-0.5b-instruct-q4_k_m.gguf ;;
  *) echo "modelo desconocido: $modelo"; exit 1 ;;
esac
gguf="$RAIZ/gguf/$modelo/$archivo"
salida="pruebas/bench-$(hostname)-$(date +%Y%m%d-%H%M).txt"
exec > >(tee "$salida") 2>&1

buscar() { for c in "$RAIZ/bin/llama-$BUILD/$1" "$RAIZ/bin/llama-$BUILD/bin/$1" "$RAIZ/bin/llama-$BUILD/build/bin/$1" "$(command -v "$1" 2>/dev/null)"; do
  [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return; }; done; }
temp() {
  if command -v vcgencmd >/dev/null 2>&1; then vcgencmd measure_temp; return; fi
  for z in /sys/class/thermal/thermal_zone*/temp; do [ -r "$z" ] && awk -v z="$z" '{printf "%s: %.1f °C\n", z, $1/1000}' "$z"; done 2>/dev/null | head -3
}
ram() { free -m | awk 'NR<=2'; }

bench="$(buscar llama-bench)"; server="$(buscar llama-server)"
export LD_LIBRARY_PATH="$(dirname "${server:-/x}"):${LD_LIBRARY_PATH:-}"
HILOS="${HILOS:-$(lscpu -p=CORE,SOCKET 2>/dev/null | awk '!/^#/' | sort -u | wc -l || true)}"; [ "$HILOS" -ge 1 ] 2>/dev/null || HILOS=$(nproc)

echo "=== Fray · bench del dispositivo · $(date -Iseconds) ==="
echo "host: $(hostname) · $(uname -srm)"
grep -m1 -E 'model name|Model' /proc/cpuinfo 2>/dev/null; tr -d '\0' < /proc/device-tree/model 2>/dev/null && echo
echo "núcleos lógicos: $(nproc) · hilos usados (físicos): $HILOS"
echo "modelo: $modelo ($gguf, $(du -h "$gguf" 2>/dev/null | cut -f1))"
echo "--- RAM antes"; ram; echo "--- temperatura antes"; temp

if [ -n "$bench" ] && [ -f "$gguf" ]; then
  echo; echo "=== llama-bench (pp = leer prompt, tg = generar; t/s) ==="
  "$bench" -m "$gguf" -t "$HILOS" -p 64,256 -n 48 -r 2 -ngl 0 2>&1 | grep -E '^\|' || echo "llama-bench falló"
else
  echo "No hay llama-bench o GGUF en $RAIZ: corre bash servidor/iniciar.sh preparar $modelo"
fi
echo "--- temperatura tras llama-bench"; temp

echo; echo "=== 5 preguntas de extremo a extremo (llama-server 127.0.0.1:$PUERTO) ==="
propio=0
if ! curl -sf "http://127.0.0.1:$PUERTO/health" >/dev/null 2>&1; then
  [ -n "$server" ] || { echo "No hay llama-server"; exit 1; }
  "$server" -m "$gguf" -t "$HILOS" -c 2048 -np 1 -ngl 0 --host 127.0.0.1 --port "$PUERTO" --no-webui >/tmp/fray-server.log 2>&1 &
  propio=$!
  for i in $(seq 1 120); do curl -sf "http://127.0.0.1:$PUERTO/health" >/dev/null 2>&1 && break; sleep 1; done
fi
echo "--- RAM con el modelo cargado"; ram
for f in herramientas/bench_cuerpos/*.json; do
  t0=$(date +%s%N)
  r=$(curl -s "http://127.0.0.1:$PUERTO/v1/chat/completions" -H 'Content-Type: application/json' -d @"$f")
  t1=$(date +%s%N)
  total=$(( (t1 - t0) / 1000000 ))
  pms=$(echo "$r" | grep -o '"prompt_ms":[0-9.]*' | cut -d: -f2); pn=$(echo "$r" | grep -o '"prompt_n":[0-9]*' | cut -d: -f2)
  gms=$(echo "$r" | grep -o '"predicted_ms":[0-9.]*' | cut -d: -f2); gn=$(echo "$r" | grep -o '"predicted_n":[0-9]*' | cut -d: -f2)
  txt=$(echo "$r" | grep -o '"content":"[^"]*"' | head -1 | cut -d'"' -f4)
  primera=$(awk -v p="${pms:-0}" -v g="${gms:-0}" -v n="${gn:-1}" 'BEGIN{printf "%d", p + (n>0 ? g/n : 0)}')
  tgs=$(awk -v g="${gms:-0}" -v n="${gn:-0}" 'BEGIN{ if (g>0) printf "%.1f", n*1000/g; else print "-"}')
  echo "$(basename "$f" .json): 1.ª palabra ≈ ${primera} ms · total ${total} ms · prompt nuevo ${pn:-?} tok · generó ${gn:-?} tok a ${tgs} t/s"
  echo "    $txt"
done
echo "--- RAM tras las preguntas"; ram; echo "--- temperatura final"; temp
[ "$propio" -gt 0 ] && kill "$propio" 2>/dev/null
echo; echo "Guardado en $salida"
