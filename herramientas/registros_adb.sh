#!/usr/bin/env sh
# Junta el registro de la prueba de Fray desde el teléfono conectado por USB (sin red: adb y 127.0.0.1).
#   sh herramientas/registros_adb.sh [-s xw55eajnzhvw5xgm] [-p "hola|¿qué es la gelifracción?"]
# Lee IndexedDB por el DevTools del WebView, las líneas FRAYLOG de `adb logcat -d` y el último /sdcard/Download/fray-registro-*.json.
# Salida: pruebas/registros/registro-<fecha>.json y .md. La lógica está en herramientas/registros_adb.mjs (node 22 o más nuevo).
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
SERIAL=${ANDROID_SERIAL:-}
PROBAR=""
while getopts "s:p:" o; do
  case "$o" in s) SERIAL=$OPTARG ;; p) PROBAR=$OPTARG ;; *) echo "uso: $0 [-s serial] [-p 'pregunta|pregunta']"; exit 2 ;; esac
done
command -v adb >/dev/null 2>&1 || { echo "No encuentro adb"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Falta node (22 o más nuevo)"; exit 1; }
set -- "$DIR/registros_adb.mjs"
[ -n "$SERIAL" ] && set -- "$@" --serial "$SERIAL"
[ -n "$PROBAR" ] && set -- "$@" --probar "$PROBAR"
exec node "$@"
