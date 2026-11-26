"""Genera los QR firmados de las estaciones para imprimir (contrato §4). Misma firma que js/qr-estacion.js.

Uso:  python -X utf8 herramientas/qr_estaciones.py [--clave-archivo contenido/qr_clave_demo.json] [--salida qr/]
Escribe qr/<estacion>.png y qr/<estacion>.svg (dibujados con lib/qrcode.js por node, sin red), y qr/qr_estaciones.json con los
textos. La clave por defecto es la de DEMOSTRACIÓN (contenido/qr_clave_demo.json): para el parque real, usa otra clave fuera del
repo y pon la misma en el paquete/configuración del dispositivo.
"""
import hashlib, hmac, json, os, subprocess, sys

H = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(H)


def arg(n, d=None):
    return sys.argv[sys.argv.index(n) + 1] if n in sys.argv else d


def texto_qr(estacion, clave):
    f = hmac.new(clave.encode('utf8'), f'FRAY1|{estacion}'.encode('utf8'), hashlib.sha256).hexdigest()[:8]
    return f'FRAY1|{estacion}|{f}'


NODE = r"""
const qrcode = require(process.argv[1]);
const textos = JSON.parse(process.argv[2]);
const out = textos.map((t) => { const q = qrcode(0, 'M'); q.addData(t); q.make(); const n = q.getModuleCount();
  const m = []; for (let r = 0; r < n; r++) { let f = ''; for (let c = 0; c < n; c++) f += q.isDark(r, c) ? '1' : '0'; m.push(f); } return m; });
console.log(JSON.stringify(out));
"""


def main():
    clave = json.load(open(os.path.join(RAIZ, arg('--clave-archivo', 'contenido/qr_clave_demo.json')), encoding='utf8'))['clave']
    paq = json.load(open(os.path.join(RAIZ, 'contenido', 'paquete.json'), encoding='utf8'))
    estaciones = [(e['id'], e['nombre']) for e in sorted(paq['estaciones'], key=lambda e: e.get('orden', 0))]
    sal = os.path.join(RAIZ, arg('--salida', 'qr'))
    os.makedirs(sal, exist_ok=True)
    textos = [texto_qr(i, clave) for i, _ in estaciones]
    r = subprocess.run(['node', '-e', NODE, os.path.join(RAIZ, 'lib', 'qrcode.js'), json.dumps(textos)], capture_output=True, text=True)
    if r.returncode:
        print(r.stderr); sys.exit(1)
    matrices = json.loads(r.stdout)
    from PIL import Image, ImageDraw, ImageFont
    for (eid, nombre), t, m in zip(estaciones, textos, matrices):
        n, esc, borde = len(m), 12, 4
        lado = (n + 2 * borde) * esc
        img = Image.new('L', (lado, lado + 60), 255)
        d = ImageDraw.Draw(img)
        for y, fila in enumerate(m):
            for x, v in enumerate(fila):
                if v == '1':
                    d.rectangle([(x + borde) * esc, (y + borde) * esc, (x + borde + 1) * esc - 1, (y + borde + 1) * esc - 1], fill=0)
        try:
            fuente = ImageFont.truetype('arial.ttf', 28)
        except OSError:
            fuente = ImageFont.load_default()
        d.text((borde * esc, lado + 10), f'Estación {nombre}', fill=0, font=fuente)
        img.save(os.path.join(sal, f'{eid}.png'))
        rects = ''.join(f'<rect x="{x + borde}" y="{y + borde}" width="1" height="1"/>' for y, fila in enumerate(m) for x, v in enumerate(fila) if v == '1')
        open(os.path.join(sal, f'{eid}.svg'), 'w', encoding='utf8').write(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n + 2 * borde} {n + 2 * borde}" shape-rendering="crispEdges">'
            f'<rect width="100%" height="100%" fill="#fff"/><g fill="#000">{rects}</g></svg>')
    json.dump([{'estacion': i, 'nombre': nm, 'texto': t} for (i, nm), t in zip(estaciones, textos)],
              open(os.path.join(sal, 'qr_estaciones.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    for (i, _), t in zip(estaciones, textos):
        print(f'{i:12} {t}')
    print(f'-> {sal}/<estacion>.png|.svg y qr_estaciones.json (clave de DEMOSTRACIÓN si no pasaste --clave-archivo)')


if __name__ == '__main__':
    main()
