"""Copia la PWA a nativo/assets/pwa/ para empaquetarla en el APK (se sirve desde la app en http://127.0.0.1).

Uso (desde la raíz del repo o desde nativo/):  python nativo/herramientas/copiar_pwa.py

- Copia sw.js y su lista APP (los archivos de la PWA) y le suma models/partes/* según models/partes.json.
- Borra antes lo copiado: assets/pwa/ es un espejo y está en .gitignore. NO se commitea (estaría duplicado).
- Verifica la huella SHA-256 de cada archivo grande unido desde sus partes, igual que sw.js.
- Si un archivo de la PWA queda en una carpeta que pubspec.yaml no declara, falla: hay que agregarla a «assets:».
"""
import hashlib, json, os, re, shutil, sys

NATIVO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAIZ = os.path.dirname(NATIVO)
DESTINO = os.path.join(NATIVO, 'assets', 'pwa')


def lista_app():
    with open(os.path.join(RAIZ, 'sw.js'), encoding='utf-8') as f:
        sw = f.read()
    m = re.search(r'const APP = \[(.*?)\];', sw, re.S)
    if not m:
        sys.exit('No encontré «const APP = [...]» en sw.js')
    # sw.js no está en su propia lista, pero la PWA lo registra: sin él no hay modo avión dentro de la app
    return ['sw.js'] + [u for u in re.findall(r"'([^']+)'", m.group(1)) if u not in ('./', '')]


def carpetas_pubspec():
    with open(os.path.join(NATIVO, 'pubspec.yaml'), encoding='utf-8') as f:
        txt = f.read()
    return {d.rstrip('/') for d in re.findall(r'^\s*-\s*(assets/pwa/[^\s#]*)', txt, re.M)}


def main():
    archivos = lista_app()
    with open(os.path.join(RAIZ, 'models', 'partes.json'), encoding='utf-8') as f:
        grandes = json.load(f)
    for m in grandes.values():
        archivos += m['partes']
    if os.path.isdir(DESTINO):
        shutil.rmtree(DESTINO)
    total = 0
    for rel in archivos:
        origen = os.path.join(RAIZ, *rel.split('/'))
        if not os.path.isfile(origen):
            sys.exit(f'Falta {rel} (está en sw.js o en models/partes.json pero no en el repo)')
        dst = os.path.join(DESTINO, *rel.split('/'))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(origen, dst)
        total += os.path.getsize(dst)
    # Huella de los grandes, como hace el service worker al unirlos
    for ruta, m in grandes.items():
        h = hashlib.sha256()
        for p in m['partes']:
            with open(os.path.join(DESTINO, *p.split('/')), 'rb') as f:
                h.update(f.read())
        if h.hexdigest() != m['sha256']:
            sys.exit(f'{ruta}: la huella de sus partes no coincide con models/partes.json')
    # Cada carpeta copiada debe estar declarada en pubspec.yaml (Flutter no incluye subcarpetas solas)
    declaradas = carpetas_pubspec()
    usadas = {('assets/pwa/' + os.path.dirname(r)).rstrip('/') for r in archivos}
    faltan = sorted(usadas - declaradas)
    if faltan:
        sys.exit('Agrega estas carpetas a «flutter: assets:» en nativo/pubspec.yaml: ' + ', '.join(f + '/' for f in faltan))
    for d in declaradas:  # Flutter falla si una carpeta declarada no existe
        os.makedirs(os.path.join(NATIVO, *d.split('/')), exist_ok=True)
    # Flutter no vuelve a listar las carpetas de assets si pubspec.yaml no cambió: un archivo nuevo quedaría fuera del APK
    os.utime(os.path.join(NATIVO, 'pubspec.yaml'))
    print(f'ok  {len(archivos)} archivos de la PWA ({total / 1e6:.1f} MB) copiados a nativo/assets/pwa/')


if __name__ == '__main__':
    main()
