"""Firma un paquete de fichas y los avisos del día y los deja listos para publicar (contrato §5 y §6).

Uso (un comando):
    python -X utf8 herramientas/firmar_paquete.py --paquete contenido/paquete.json --avisos avisos.json

Qué hace:
  1. Si no existe la clave privada, genera el par ECDSA P-256. La privada queda FUERA del repo (--claves o la variable
     FRAY_CLAVES; por omisión C:/Users/danna/espeletia-llm/claves). La pública (JWK) va a contenido/clave_publica.json.
  2. Valida el paquete con herramientas/validar_paquete.py (si hay errores, no firma).
  3. Valida los avisos: solo `tipo: "operativo"`; rechaza cualquier aviso sobre el volcán, alertas o salud.
  4. Escribe en --salida (por omisión ./publicado; manifest, paquete y avisos van en git y se despliegan, decisión 12;
     publicar: herramientas/Publicar.cmd): manifest.json, paquete.json, avisos.json y
     fray-paquete-usb.json (los tres juntos, para copiar por USB).

Firma: ECDSA P-256 con SHA-256, base64 del formato r||s (64 bytes, el que usa WebCrypto), sobre el texto
    "FRAY1\n{version}\n{sha256}\n{avisos_sha256}\n{publicado}"
con sha256 y avisos_sha256 en hex de los bytes exactos de paquete.json y avisos.json publicados.

Otros usos:
    --generar-claves        solo genera el par (no sobrescribe una privada existente salvo con --forzar)
    --clave-publica RUTA    dónde escribir/leer la JWK pública (por omisión contenido/clave_publica.json)
    --publicado ISO         fecha de publicación (por omisión, ahora en UTC)

Requiere el paquete `cryptography` (pip install cryptography, en un venv fuera del repo).
"""
import argparse
import base64
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

RAIZ = Path(__file__).resolve().parent.parent
CLAVES_POR_OMISION = os.environ.get("FRAY_CLAVES", r"C:\Users\danna\espeletia-llm\claves")
PUBLICA_POR_OMISION = RAIZ / "contenido" / "clave_publica.json"
ESTACIONES = {"brisas", "aguacerales", "arenales", "lunares", "tumbas"}

# Un aviso nunca habla del volcán, de alertas ni de salud: eso lo dice el personal en persona (carril crítico).
# Propuesta futura (roadmap, validar con UTON): avisos oficiales de ese tipo con otra firma y otro flujo. Hoy se rechazan.
AVISO_PROHIBIDO = re.compile(
    r"volc[aá]n|volc[aá]nic|cr[aá]ter|erupci|ceniza|sism|temblor|lahar|\bsgc\b|servicio\s+geol[oó]gico|alerta"
    r"|salud|s[ií]ntoma|m[eé]dic|medicament|enferm|herid|hipotermia|soroche|mal\s+de\s+altura|mal\s+de\s+monta"
    r"|ox[ií]geno|primeros\s+auxilios|evacua|emergencia",
    re.I)


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def jwk_de(clave_publica):
    n = clave_publica.public_numbers()
    return {"kty": "EC", "crv": "P-256", "x": b64url(n.x.to_bytes(32, "big")), "y": b64url(n.y.to_bytes(32, "big")),
            "ext": True, "key_ops": ["verify"]}


def ruta_privada(dir_claves):
    return Path(dir_claves) / "fray_privada.pem"


def asegurar_fuera_del_repo(ruta):
    try:
        Path(ruta).resolve().relative_to(RAIZ)
    except ValueError:
        return
    sys.exit(f"ERROR la clave privada no puede quedar dentro del repo: {ruta}")


def generar_claves(dir_claves, ruta_publica, forzar=False):
    priv_path = ruta_privada(dir_claves)
    asegurar_fuera_del_repo(priv_path)
    if priv_path.exists() and not forzar:
        sys.exit(f"ERROR ya existe {priv_path}; usa --forzar para reemplazarla (los dispositivos dejarán de aceptar "
                 f"paquetes hasta que reciban la nueva clave pública)")
    priv_path.parent.mkdir(parents=True, exist_ok=True)
    clave = ec.generate_private_key(ec.SECP256R1())
    priv_path.write_bytes(clave.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                              serialization.NoEncryption()))
    escribir_publica(clave, ruta_publica)
    print(f"Par de claves generado. Privada (NO subir a git): {priv_path}")
    print(f"Pública (va al repo y a los dispositivos): {ruta_publica}")
    return clave


def escribir_publica(clave, ruta_publica):
    Path(ruta_publica).parent.mkdir(parents=True, exist_ok=True)
    Path(ruta_publica).write_text(json.dumps(jwk_de(clave.public_key()), indent=2) + "\n", encoding="utf-8")


def cargar_o_generar(dir_claves, ruta_publica):
    priv_path = ruta_privada(dir_claves)
    asegurar_fuera_del_repo(priv_path)
    if not priv_path.exists():
        return generar_claves(dir_claves, ruta_publica)
    clave = serialization.load_pem_private_key(priv_path.read_bytes(), password=None)
    esperada = jwk_de(clave.public_key())
    rp = Path(ruta_publica)
    if not rp.exists():
        escribir_publica(clave, rp)
        print(f"Clave pública escrita en {rp}")
    else:
        actual = json.loads(rp.read_text(encoding="utf-8"))
        if (actual.get("x"), actual.get("y")) != (esperada["x"], esperada["y"]):
            sys.exit(f"ERROR {rp} no corresponde a la clave privada {priv_path}: los dispositivos rechazarían el paquete")
    return clave


def firmar(clave, mensaje):
    der = clave.sign(mensaje.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    return base64.b64encode(r.to_bytes(32, "big") + s.to_bytes(32, "big")).decode("ascii")


def mensaje_firma(version, sha, avisos_sha, publicado):
    return f"FRAY1\n{version}\n{sha}\n{avisos_sha}\n{publicado}"


def validar_paquete(ruta):
    """Corre herramientas/validar_paquete.py sobre `ruta` (sin modificar el validador)."""
    sys.path.insert(0, str(RAIZ / "herramientas"))
    import validar_paquete as vp
    vp.PAQUETE = Path(ruta).resolve()
    try:
        vp.main()
    except SystemExit as e:
        if e.code not in (0, None):
            sys.exit("ERROR el paquete no pasa validar_paquete.py: no se firma")


def parse_fecha(t, donde, errores):
    try:
        d = datetime.fromisoformat(str(t).replace("Z", "+00:00"))
    except ValueError:
        errores.append(f"{donde}: fecha inválida «{t}» (usa ISO 8601, p. ej. 2026-11-26T07:00:00-05:00)")
        return None
    if d.tzinfo is None:
        errores.append(f"{donde}: la fecha «{t}» necesita zona horaria (p. ej. -05:00)")
        return None
    return d


def validar_avisos(avisos):
    errores = []
    if not isinstance(avisos, list):
        return ["avisos.json debe ser una lista"]
    ids = set()
    for i, a in enumerate(avisos):
        donde = f"aviso #{i} ({a.get('id', 'sin id') if isinstance(a, dict) else '?'})"
        if not isinstance(a, dict):
            errores.append(f"{donde}: no es un objeto")
            continue
        for k in ["id", "texto", "tipo", "emitidoPor", "vigenteDesde", "vigenteHasta", "estaciones"]:
            if k not in a:
                errores.append(f"{donde}: falta «{k}»")
        if a.get("id") in ids:
            errores.append(f"{donde}: id repetido")
        ids.add(a.get("id"))
        if a.get("tipo") != "operativo":
            errores.append(f"{donde}: tipo debe ser «operativo»")
        texto = str(a.get("texto") or "")
        if not texto.strip() or len(texto) > 280:
            errores.append(f"{donde}: texto vacío o de más de 280 caracteres")
        emisor = str(a.get("emitidoPor") or "")
        if not emisor.strip() or len(emisor) > 60:
            errores.append(f"{donde}: emitidoPor es el cargo (p. ej. «Coordinación de guías, Brisas»), no un nombre")
        m = AVISO_PROHIBIDO.search(texto + " " + emisor)
        if m:
            errores.append(f"{donde}: un aviso no puede hablar de volcán, alertas ni salud («{m.group(0)}»); "
                           f"eso lo comunica el personal en persona")
        desde = parse_fecha(a.get("vigenteDesde"), donde, errores)
        hasta = parse_fecha(a.get("vigenteHasta"), donde, errores)
        if desde and hasta and hasta <= desde:
            errores.append(f"{donde}: vigenteHasta debe ser posterior a vigenteDesde")
        est = a.get("estaciones")
        if est is not None and (not isinstance(est, list) or not est or not set(est) <= ESTACIONES):
            errores.append(f"{donde}: estaciones debe ser null o una lista de {sorted(ESTACIONES)}")
    return errores


def clave_version(v):
    return [int(x) for x in re.findall(r"\d+", str(v))]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--paquete")
    ap.add_argument("--avisos", help="avisos.json; si no se da, se publica una lista vacía")
    ap.add_argument("--salida", default=str(RAIZ / "publicado"))
    ap.add_argument("--claves", default=CLAVES_POR_OMISION)
    ap.add_argument("--clave-publica", default=str(PUBLICA_POR_OMISION))
    ap.add_argument("--publicado")
    ap.add_argument("--generar-claves", action="store_true")
    ap.add_argument("--forzar", action="store_true")
    a = ap.parse_args()

    if a.generar_claves:
        generar_claves(a.claves, a.clave_publica, a.forzar)
        return
    if not a.paquete:
        ap.error("falta --paquete")

    raw = Path(a.paquete).read_bytes()
    paquete = json.loads(raw.decode("utf-8-sig"))
    validar_paquete(a.paquete)

    avisos = json.loads(Path(a.avisos).read_text(encoding="utf-8-sig")) if a.avisos else []
    errores = validar_avisos(avisos)
    if errores:
        for e in errores:
            print("ERROR ", e)
        sys.exit(f"{len(errores)} errores en los avisos: no se firma")
    avisos_raw = (json.dumps(avisos, ensure_ascii=False, indent=1) + "\n").encode("utf-8")

    salida = Path(a.salida)
    version = str(paquete["version"])
    sha = hashlib.sha256(raw).hexdigest()
    previo = salida / "manifest.json"
    if previo.exists():
        m0 = json.loads(previo.read_text(encoding="utf-8"))
        if clave_version(version) < clave_version(m0["version"]):
            sys.exit(f"ERROR la versión {version} es menor que la publicada {m0['version']}")
        if clave_version(version) == clave_version(m0["version"]) and sha != m0["sha256"]:
            sys.exit(f"ERROR el paquete cambió pero la versión sigue en {version}: súbela (los dispositivos solo "
                     f"descargan versiones mayores)")

    clave = cargar_o_generar(a.claves, a.clave_publica)
    avisos_sha = hashlib.sha256(avisos_raw).hexdigest()
    publicado = a.publicado or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    manifest = {
        "formato": 1,
        "version": version,
        "sha256": sha,
        "avisos_sha256": avisos_sha,
        "publicado": publicado,
        "firma": firmar(clave, mensaje_firma(version, sha, avisos_sha, publicado)),
    }
    salida.mkdir(parents=True, exist_ok=True)
    (salida / "paquete.json").write_bytes(raw)
    (salida / "avisos.json").write_bytes(avisos_raw)
    usb = {"formato": "fray-usb-1", "manifest": manifest, "paquete": raw.decode("utf-8"),
           "avisos": avisos_raw.decode("utf-8")}
    (salida / "fray-paquete-usb.json").write_text(json.dumps(usb, ensure_ascii=False), encoding="utf-8")
    # El manifest se escribe al final: un dispositivo que lo lea ya encuentra los archivos que describe.
    (salida / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Publicado v{version} · {len(paquete.get('fichas', []))} fichas · {len(avisos)} avisos → {salida}")


if __name__ == "__main__":
    main()
