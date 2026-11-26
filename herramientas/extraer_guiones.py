"""Extrae el texto de los guiones por página (páginas del PDF, desde 1).

Uso (en un venv con pypdf, fuera del repo):
    python -X utf8 herramientas/extraer_guiones.py SALIDA_DIR

Escribe SALIDA_DIR/UTON2024.json y SALIDA_DIR/NORTE.json con {"paginas": {"1": "...", ...}}
y un .txt legible con marcas «=== p. N ===». No escribas la salida dentro del repo.
"""
import json
import sys
from pathlib import Path

from pypdf import PdfReader

RAIZ = Path(__file__).resolve().parent.parent
GUIONES = {
    "UTON2024": RAIZ / "fuentes" / "guion-uton-2024.pdf",
    "NORTE": RAIZ / "fuentes" / "guion-zona-norte.pdf",
}


def main() -> None:
    salida = Path(sys.argv[1] if len(sys.argv) > 1 else "guiones_texto")
    salida.mkdir(parents=True, exist_ok=True)
    for clave, ruta in GUIONES.items():
        lector = PdfReader(str(ruta))
        paginas = {str(i): (p.extract_text() or "") for i, p in enumerate(lector.pages, start=1)}
        (salida / f"{clave}.json").write_text(
            json.dumps({"guion": clave, "paginas": paginas}, ensure_ascii=False, indent=1), encoding="utf-8")
        with open(salida / f"{clave}.txt", "w", encoding="utf-8") as f:
            for n, t in paginas.items():
                f.write(f"\n=== {clave} p. {n} ===\n{t}\n")
        print(clave, len(paginas), "páginas")


if __name__ == "__main__":
    main()
