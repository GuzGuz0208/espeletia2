#!/usr/bin/env bash
# Publicar para todos los teléfonos (decisión 12; paso a paso en docs/operacion-base.md). Equivalente de publicar.ps1.
# Uso: herramientas/publicar.sh [paquete.json] [avisos.json]
#   Por omisión: ~/Downloads/paquete-publicar.json y ~/Downloads/avisos.json (si existe).
#   Clave privada fuera del repo: FRAY_CLAVES (por omisión la de firmar_paquete.py). Python: FRAY_PYTHON o python3.
#   SIN_PUSH=1 para firmar y hacer commit sin subir.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PAQUETE="${1:-$HOME/Downloads/paquete-publicar.json}"
AVISOS="${2:-$HOME/Downloads/avisos.json}"
PY="${FRAY_PYTHON:-python3}"

[ -f "$PAQUETE" ] || { echo "No encontré $PAQUETE. En el Panel: «Exportar para publicar»."; exit 1; }
echo "1/4 Trayendo la última versión del repositorio…"
git -C "$REPO" checkout main >/dev/null
git -C "$REPO" pull --ff-only
echo "2/4 Revisando y firmando el paquete…"
ARGS=(-X utf8 "$REPO/herramientas/firmar_paquete.py" --paquete "$PAQUETE" --salida "$REPO/publicado")
if [ -f "$AVISOS" ]; then ARGS+=(--avisos "$AVISOS"); echo "    con avisos: $AVISOS"; else echo "    sin avisos del día"; fi
"$PY" "${ARGS[@]}"
VERSION="$("$PY" -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$REPO/publicado/manifest.json")"
echo "3/4 Guardando la versión $VERSION…"
git -C "$REPO" add publicado/manifest.json publicado/paquete.json publicado/avisos.json
if git -C "$REPO" diff --cached --quiet; then echo "La versión $VERSION ya estaba publicada."; exit 0; fi
git -C "$REPO" commit -m "publicar: contenido del parque v$VERSION" >/dev/null
if [ "${SIN_PUSH:-}" = "1" ]; then echo "Firmado y guardado (v$VERSION), sin subir."; exit 0; fi
echo "4/4 Subiendo a internet…"
git -C "$REPO" push origin main
echo "Listo: versión $VERSION publicada. En 1-2 minutos todos los teléfonos con señal la reciben y la activan solos."
