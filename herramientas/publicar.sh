#!/usr/bin/env bash
# Publicar para todos los teléfonos (decisión 12; paso a paso en docs/operacion-base.md). Equivalente de publicar.ps1.
# Uso: herramientas/publicar.sh [paquete.json] [avisos.json]
#   Por omisión: ~/Downloads/paquete-publicar.json (exportado del Panel, con `exportadoEn`). Avisos SOLO si se pasan.
#   Muestra versión, fecha y SHA-256 y pide confirmación (S/N). Rechaza duplicados «(1)», paquetes sin exportadoEn o no
#   más nuevos que el publicado. Tras publicar borra los archivos de entrada.
#   Clave privada fuera del repo: FRAY_CLAVES (por omisión la de firmar_paquete.py). Python: FRAY_PYTHON o python3.
#   SIN_PUSH=1 para firmar y hacer commit sin subir (no borra la entrada).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PAQUETE="${1:-$HOME/Downloads/paquete-publicar.json}"
AVISOS="${2:-}"
PY="${FRAY_PYTHON:-python3}"

[ -f "$PAQUETE" ] || { echo "No encontré $PAQUETE. En el Panel: «Exportar para publicar»."; exit 1; }
BASE="$(basename "$PAQUETE" .json)"
DIR="$(dirname "$PAQUETE")"
shopt -s nullglob; DUPS=("$DIR/$BASE "\(*\).json); shopt -u nullglob
if [ ${#DUPS[@]} -gt 0 ]; then
  echo "Hay copias duplicadas de $BASE en $(dirname "$PAQUETE"). Bórralas, exporta otra vez y vuelve a publicar."; exit 1
fi
[ -z "$AVISOS" ] || [ -f "$AVISOS" ] || { echo "No encontré los avisos: $AVISOS"; exit 1; }

echo "1/4 Trayendo la última versión del repositorio…"
git -C "$REPO" checkout main >/dev/null
git -C "$REPO" -c pull.rebase=false pull --ff-only origin main

# Revisión previa: exportadoEn, versión mayor que la publicada, resumen con hash
"$PY" - "$PAQUETE" "$REPO/publicado/manifest.json" "${AVISOS:-}" <<'EOF'
import hashlib, json, os, re, sys
from datetime import datetime, timedelta, timezone
paq, man, av = sys.argv[1], sys.argv[2], sys.argv[3]
p = json.load(open(paq, encoding="utf-8-sig"))
v = str(p.get("version") or "")
if not v: sys.exit("El archivo no es un paquete del Panel (no tiene versión).")
if not p.get("exportadoEn"): sys.exit("Falta exportadoEn: exporta con «Exportar para publicar» del Panel.")
try: exp = datetime.fromisoformat(str(p["exportadoEn"]).replace("Z", "+00:00"))
except ValueError: sys.exit(f"Fecha de exportación inválida: {p['exportadoEn']}")
if exp > datetime.now(timezone.utc) + timedelta(minutes=10): sys.exit("La fecha de exportación está en el futuro.")
k = lambda x: [int(n) for n in re.findall(r"\d+", str(x))]
pub = json.load(open(man, encoding="utf-8"))["version"] if os.path.exists(man) else None
if pub and k(v) <= k(pub): sys.exit(f"El paquete ({v}) no es más nuevo que el publicado ({pub}).")
h = lambda f: hashlib.sha256(open(f, "rb").read()).hexdigest()
print(f"Vas a publicar para TODOS los teléfonos:\n  Paquete:   {paq}\n  Versión:   {v} (publicada ahora: {pub or 'ninguna'})"
      f"\n  Exportado: {exp.astimezone().strftime('%Y-%m-%d %H:%M')}\n  Fichas:    {len(p.get('fichas', []))}\n  SHA-256:   {h(paq)}")
print(f"  Avisos:    {av} · SHA-256 {h(av)}" if av else "  Avisos:    ninguno (lista vacía)")
EOF
read -r -p "¿Publicar? Escribe S para sí o N para no: " R
[[ "$R" =~ ^[[:space:]]*[sS][[:space:]]*$ ]] || { echo "No se publicó nada."; exit 1; }

echo "2/4 Revisando y firmando el paquete…"
ARGS=(-X utf8 "$REPO/herramientas/firmar_paquete.py" --paquete "$PAQUETE" --salida "$REPO/publicado")
[ -n "$AVISOS" ] && ARGS+=(--avisos "$AVISOS")
"$PY" "${ARGS[@]}"
VERSION="$("$PY" -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$REPO/publicado/manifest.json")"
echo "3/4 Guardando la versión $VERSION…"
git -C "$REPO" add publicado/manifest.json publicado/paquete.json publicado/avisos.json
if git -C "$REPO" diff --cached --quiet; then echo "La versión $VERSION ya estaba publicada."; exit 0; fi
git -C "$REPO" commit -m "publicar: contenido del parque v$VERSION" >/dev/null
if [ "${SIN_PUSH:-}" = "1" ]; then echo "Firmado y guardado (v$VERSION), sin subir."; exit 0; fi
echo "4/4 Subiendo a internet…"
git -C "$REPO" push origin main
rm -f -- "$PAQUETE"; [ -z "$AVISOS" ] || rm -f -- "$AVISOS"
echo "Listo: versión $VERSION publicada. En 1-2 minutos todos los teléfonos con señal la reciben y la activan solos."
