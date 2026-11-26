"""Servidor de sincronización de la base (Brisas): Python estándar, sin dependencias.

Sirve el paquete firmado y los avisos del día a los dispositivos y recibe las preguntas que terminaron en abstención
(contrato §5). Pensado para un PC o una Raspberry Pi en la oficina de la base, como wifi local SIN internet.

Uso:
    python -X utf8 servidor/sync_base.py --publicado publicado --datos datos --puerto 8090 \
        --origen http://192.168.4.1:8000

    --publicado DIR   carpeta que escribe herramientas/firmar_paquete.py (manifest.json, paquete.json, avisos.json,
                      fray-paquete-usb.json). Solo se sirven esos cuatro archivos.
    --datos DIR       carpeta donde se guarda bandeja.jsonl (preguntas recibidas). Fuera de git.
    --origen URL      origen de la app (CORS). Se puede repetir. Sin --origen, no se envían cabeceras CORS
                      (sirve para clientes que no son navegador, como la prueba de punta a punta).
    --host            por omisión 0.0.0.0 (toda la red local).
    Variable FRAY_TOKEN_PANEL (opcional): si existe, GET /bandeja exige «Authorization: Bearer <token>».

Rutas:
    GET  /manifest.json, /paquete.json, /avisos.json, /fray-paquete-usb.json
    POST /sin-respuesta   cuerpo {dispositivo, preguntas: [{id, texto, estacion, fecha, versionPaquete}]}
                          responde {ok: true, ids: [...]} con los ids guardados (o ya guardados antes: idempotente)
    GET  /bandeja         preguntas agrupadas por texto normalizado y estación, con conteo, para el panel
    GET  /salud           {ok: true}
"""
import argparse
import json
import os
import re
import sys
import threading
import unicodedata
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ARCHIVOS = {"/manifest.json", "/paquete.json", "/avisos.json", "/fray-paquete-usb.json"}
ESTACIONES = {"brisas", "aguacerales", "arenales", "lunares", "tumbas"}
MAX_CUERPO = 64 * 1024
MAX_PREGUNTAS = 200
MAX_TEXTO = 200
RE_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
RE_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RE_CORREO = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
RE_NUMERO = re.compile(r"\+?\d[\d\s-]{6,}\d")


def limpiar_texto(t):
    """Recorta a 200 caracteres y tapa correos y números largos (teléfonos, documentos)."""
    t = re.sub(r"\s+", " ", str(t)).strip()
    t = RE_CORREO.sub("[correo]", t)
    t = RE_NUMERO.sub("[número]", t)
    return t[:MAX_TEXTO]


def normalizar(t):
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9ñ ]+", " ", t).split())


class Bandeja:
    def __init__(self, ruta):
        self.ruta = Path(ruta)
        self.ruta.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.ids = set()
        if self.ruta.exists():
            for linea in self.ruta.read_text(encoding="utf-8").splitlines():
                if linea.strip():
                    self.ids.add(json.loads(linea)["id"])

    def agregar(self, dispositivo, preguntas):
        aceptadas, nuevas = [], []
        recibido = datetime.now(timezone.utc).date().isoformat()
        for p in preguntas:
            if not isinstance(p, dict):
                continue
            pid, texto = str(p.get("id", "")), limpiar_texto(p.get("texto", ""))
            if not RE_ID.match(pid) or not texto:
                continue
            estacion = p.get("estacion") if p.get("estacion") in ESTACIONES else None
            fecha = p.get("fecha") if RE_FECHA.match(str(p.get("fecha", ""))) else recibido
            aceptadas.append(pid)
            if pid in self.ids:
                continue
            nuevas.append({"id": pid, "texto": texto, "estacion": estacion, "fecha": fecha,
                           "versionPaquete": str(p.get("versionPaquete") or "")[:40],
                           "dispositivo": dispositivo, "recibido": recibido})
        with self.lock:
            with self.ruta.open("a", encoding="utf-8") as f:
                for n in nuevas:
                    if n["id"] in self.ids:
                        continue
                    self.ids.add(n["id"])
                    f.write(json.dumps(n, ensure_ascii=False) + "\n")
        return aceptadas

    def agrupada(self):
        grupos = {}
        if self.ruta.exists():
            with self.lock:
                lineas = self.ruta.read_text(encoding="utf-8").splitlines()
            for linea in lineas:
                if not linea.strip():
                    continue
                r = json.loads(linea)
                k = (normalizar(r["texto"]), r.get("estacion"))
                g = grupos.setdefault(k, {"normalizado": k[0], "estacion": k[1], "conteo": 0, "textos": {},
                                          "primera": r["fecha"], "ultima": r["fecha"], "versiones": set(),
                                          "dispositivos": set()})
                g["conteo"] += 1
                g["textos"][r["texto"]] = g["textos"].get(r["texto"], 0) + 1
                g["primera"], g["ultima"] = min(g["primera"], r["fecha"]), max(g["ultima"], r["fecha"])
                if r.get("versionPaquete"):
                    g["versiones"].add(r["versionPaquete"])
                g["dispositivos"].add(r.get("dispositivo"))
        salida = []
        for g in grupos.values():
            salida.append({
                "texto": max(g["textos"].items(), key=lambda kv: kv[1])[0],
                "normalizado": g["normalizado"], "estacion": g["estacion"], "conteo": g["conteo"],
                "dispositivos": len(g["dispositivos"]), "primera": g["primera"], "ultima": g["ultima"],
                "versiones": sorted(g["versiones"]), "variantes": sorted(g["textos"]),
            })
        salida.sort(key=lambda g: g["ultima"], reverse=True)
        salida.sort(key=lambda g: g["conteo"], reverse=True)
        return salida


def crear_manejador(publicado, bandeja, origenes, token):
    class Manejador(BaseHTTPRequestHandler):
        server_version = "FraySyncBase/1"

        def log_message(self, fmt, *args):
            sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

        def cors(self):
            origen = self.headers.get("Origin")
            if origen and origen in origenes:
                self.send_header("Access-Control-Allow-Origin", origen)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
                self.send_header("Access-Control-Max-Age", "600")

        def responder(self, codigo, cuerpo, tipo="application/json; charset=utf-8"):
            if isinstance(cuerpo, (dict, list)):
                cuerpo = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(cuerpo)))
            self.send_header("Cache-Control", "no-store")
            self.cors()
            self.end_headers()
            self.wfile.write(cuerpo)

        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            ruta = self.path.split("?", 1)[0]
            if ruta in ARCHIVOS:
                f = Path(publicado) / ruta.lstrip("/")
                if not f.exists():
                    return self.responder(404, {"ok": False, "error": "aún no hay nada publicado"})
                return self.responder(200, f.read_bytes())
            if ruta == "/bandeja":
                if token and self.headers.get("Authorization") != f"Bearer {token}":
                    return self.responder(401, {"ok": False, "error": "falta el token del panel"})
                return self.responder(200, {"ok": True, "grupos": bandeja.agrupada()})
            if ruta == "/salud":
                return self.responder(200, {"ok": True})
            return self.responder(404, {"ok": False, "error": "no existe"})

        def do_POST(self):
            if self.path.split("?", 1)[0] != "/sin-respuesta":
                return self.responder(404, {"ok": False, "error": "no existe"})
            try:
                n = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                n = 0
            if n <= 0 or n > MAX_CUERPO:
                return self.responder(413, {"ok": False, "error": "cuerpo vacío o demasiado grande"})
            try:
                datos = json.loads(self.rfile.read(n).decode("utf-8"))
                preguntas = datos["preguntas"]
                assert isinstance(preguntas, list) and len(preguntas) <= MAX_PREGUNTAS
            except Exception:
                return self.responder(400, {"ok": False, "error": "se espera {dispositivo, preguntas: [...]}"})
            dispositivo = str(datos.get("dispositivo") or "")
            dispositivo = dispositivo if RE_ID.match(dispositivo) else "desconocido"
            ids = bandeja.agregar(dispositivo, preguntas)
            return self.responder(200, {"ok": True, "ids": ids})

    return Manejador


def crear_servidor(host, puerto, publicado, datos, origenes=(), token=None):
    bandeja = Bandeja(Path(datos) / "bandeja.jsonl")
    return ThreadingHTTPServer((host, puerto), crear_manejador(publicado, bandeja, set(origenes), token))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--publicado", default="publicado")
    ap.add_argument("--datos", default="datos")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--puerto", type=int, default=8090)
    ap.add_argument("--origen", action="append", default=[])
    a = ap.parse_args()
    srv = crear_servidor(a.host, a.puerto, a.publicado, a.datos, a.origen, os.environ.get("FRAY_TOKEN_PANEL"))
    print(f"Base de sincronización en http://{a.host}:{srv.server_address[1]} · publicado={a.publicado} · "
          f"datos={a.datos} · CORS={a.origen or 'ninguno'}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
