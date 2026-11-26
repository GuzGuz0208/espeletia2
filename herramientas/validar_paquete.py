"""Valida contenido/paquete.json (contrato §1) y contenido/preguntas_desarrollo.json.

Uso:
    python -X utf8 herramientas/validar_paquete.py [--fuentes DIR]

--fuentes DIR: carpeta (fuera del repo) con UTON2024.json y NORTE.json de herramientas/extraer_guiones.py.
Si se da, comprueba además la fidelidad: qué parte del texto de cada ficha aparece literal en las páginas citadas.

Sale con código 1 si hay errores. Las advertencias no bloquean.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PAQUETE = RAIZ / "contenido" / "paquete.json"
PREGUNTAS = RAIZ / "contenido" / "preguntas_desarrollo.json"

ESTACIONES = {"brisas", "aguacerales", "arenales", "lunares", "tumbas"}
TEMAS = {"agua", "flora", "fauna", "geologia", "glaciar", "clima", "cultura", "historia", "normas", "glosario"}
TIPOS = {"ciencia", "relato", "norma", "glosario"}
ESTADOS = {"validado", "borrador"}
CAMPOS = ["id", "estacion", "tema", "tipo", "titulo", "texto", "breve", "citas", "preguntas", "bloqueada", "motivo", "estado"]
# Nunca en una ficha que se usa para responder.
PROHIBIDO = re.compile(
    r"alerta\s+(amarilla|naranja|roja)|nivel\s+de\s+(estado\s+de\s+)?alerta|acetazolamida|comestible|se\s+puede\s+comer"
    r"|se\s+pueden\s+comer|es\s+t[oó]xic", re.I)
TIPOS_PREGUNTA = {"respuesta", "abstencion", "seguridad", "conflicto"}


def norm(t):
    t = unicodedata.normalize("NFC", t)
    t = t.replace("“", '"').replace("”", '"').replace("’", "'").replace("´", "'")
    return re.sub(r"\s+", " ", t).strip()


def sin_puntuacion(t):
    t = unicodedata.normalize("NFD", norm(t).lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9ñ ]+", " ", t).split()


def breve_extractivo(breve, texto):
    b, t = norm(breve), norm(texto)
    if b in t:
        return True
    frases = [f.strip() for f in re.split(r"(?<=[.!?])\s+", b) if f.strip()]
    return all(f in t or f.rstrip(".") in t for f in frases)


def main():
    errores, avisos = [], []
    fuentes_dir = None
    if "--fuentes" in sys.argv:
        fuentes_dir = Path(sys.argv[sys.argv.index("--fuentes") + 1])

    p = json.loads(PAQUETE.read_text(encoding="utf-8"))
    for k in ["version", "actualizado", "fuentes", "estaciones", "fichas", "conflictos"]:
        if k not in p:
            errores.append(f"falta la clave raíz «{k}»")
    fuentes = p.get("fuentes", {})
    paginas = {g: f.get("paginas") for g, f in fuentes.items()}

    def check_citas(citas, donde):
        if not isinstance(citas, list) or not citas:
            errores.append(f"{donde}: sin citas")
            return
        for c in citas:
            g, pg = c.get("guion"), c.get("pagina")
            if g not in paginas:
                errores.append(f"{donde}: guion desconocido {g}")
            elif not isinstance(pg, int) or not 1 <= pg <= paginas[g]:
                errores.append(f"{donde}: página fuera de rango {g} p. {pg}")

    ids_est = set()
    for e in p.get("estaciones", []):
        ids_est.add(e.get("id"))
        if e.get("altitud"):
            check_citas(e["altitud"].get("citas"), f"estación {e.get('id')}")
    if ids_est != ESTACIONES:
        errores.append(f"estaciones esperadas {sorted(ESTACIONES)}, hay {sorted(ids_est)}")

    textos_guion = {}
    if fuentes_dir:
        for g in paginas:
            d = json.loads((fuentes_dir / f"{g}.json").read_text(encoding="utf-8"))
            textos_guion[g] = {int(k): " ".join(sin_puntuacion(v)) for k, v in d["paginas"].items()}

    ids = set()
    fidelidad = []
    for i, f in enumerate(p.get("fichas", [])):
        fid = f.get("id", f"#{i}")
        for c in CAMPOS:
            if c not in f:
                errores.append(f"{fid}: falta el campo «{c}»")
        if fid in ids:
            errores.append(f"{fid}: id repetido")
        ids.add(fid)
        if f.get("estacion") is not None and f.get("estacion") not in ESTACIONES:
            errores.append(f"{fid}: estación inválida {f.get('estacion')}")
        if f.get("tema") not in TEMAS:
            errores.append(f"{fid}: tema inválido {f.get('tema')}")
        if f.get("tipo") not in TIPOS:
            errores.append(f"{fid}: tipo inválido {f.get('tipo')}")
        if f.get("estado") not in ESTADOS:
            errores.append(f"{fid}: estado inválido {f.get('estado')}")
        check_citas(f.get("citas"), fid)
        texto, breve = f.get("texto") or "", f.get("breve") or ""
        if not texto.strip() or not breve.strip():
            errores.append(f"{fid}: texto o breve vacío")
        elif not breve_extractivo(breve, texto):
            errores.append(f"{fid}: «breve» no está literal en «texto»")
        if f.get("bloqueada"):
            if not f.get("motivo"):
                errores.append(f"{fid}: bloqueada sin motivo")
        else:
            m = PROHIBIDO.search(texto + " " + breve)
            if m:
                errores.append(f"{fid}: ficha no bloqueada contiene «{m.group(0)}»")
        n = len(texto.split())
        if f.get("tipo") != "glosario" and not f.get("bloqueada") and not 25 <= n <= 200:
            avisos.append(f"{fid}: {n} palabras (guía: 60-180)")
        npq = len(f.get("preguntas") or [])
        if npq < 2:
            errores.append(f"{fid}: menos de 2 preguntas")
        elif npq > 10:
            avisos.append(f"{fid}: {npq} preguntas")
        if textos_guion and texto:
            pal = sin_puntuacion(texto)
            fuente = " ".join(textos_guion[c["guion"]].get(c["pagina"], "") for c in f.get("citas", []))
            k = 6
            tejas = [" ".join(pal[j:j + k]) for j in range(max(1, len(pal) - k + 1))]
            ok = sum(1 for t in tejas if t in fuente)
            r = ok / len(tejas) if tejas else 0
            fidelidad.append(r)
            if r < 0.5:
                avisos.append(f"{fid}: solo {r:.0%} del texto aparece literal en las páginas citadas")

    for c in p.get("conflictos", []):
        if not c.get("tema") or not c.get("nota"):
            errores.append(f"conflicto sin tema o nota: {c}")
        for fid in c.get("fichas", []):
            if fid not in ids:
                errores.append(f"conflicto «{c.get('tema')}»: ficha inexistente {fid}")
        if len(c.get("fichas", [])) < 2:
            errores.append(f"conflicto «{c.get('tema')}»: necesita al menos 2 fichas")

    if PREGUNTAS.exists():
        q = json.loads(PREGUNTAS.read_text(encoding="utf-8"))
        for j, it in enumerate(q.get("preguntas", [])):
            donde = f"pregunta #{j} «{it.get('p', '')[:40]}»"
            esp = it.get("esperado", {})
            if not it.get("p"):
                errores.append(f"{donde}: sin texto")
            if it.get("estacion") is not None and it.get("estacion") not in ESTACIONES:
                errores.append(f"{donde}: estación inválida")
            if esp.get("tipo") not in TIPOS_PREGUNTA:
                errores.append(f"{donde}: tipo esperado inválido {esp.get('tipo')}")
            for fid in esp.get("fichas") or []:
                if fid not in ids:
                    errores.append(f"{donde}: ficha inexistente {fid}")
            if esp.get("citas"):
                check_citas(esp["citas"], donde)

    fichas = p.get("fichas", [])
    print(f"{len(fichas)} fichas · {sum(1 for f in fichas if f.get('bloqueada'))} bloqueadas · "
          f"{len(p.get('conflictos', []))} conflictos")
    if fidelidad:
        print(f"fidelidad media (tejas de 6 palabras literales en las páginas citadas): {sum(fidelidad) / len(fidelidad):.0%}")
    for a in avisos:
        print("AVISO ", a)
    for e in errores:
        print("ERROR ", e)
    print("OK" if not errores else f"{len(errores)} errores")
    sys.exit(1 if errores else 0)


if __name__ == "__main__":
    main()
