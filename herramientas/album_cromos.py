# Genera contenido/album.json: los cromos del Álbum del Páramo, cada uno con un dato LITERAL de los guiones y su cita.
# Fuentes:
#   1. contenido/cromos.json de la rama eduardo/cromos (10 cromos con dato literal y cita), copiado aquí en EDUARDO.
#   2. Para los demás cromos del álbum anterior: la ficha equivalente de contenido/paquete.json (dato = breve, cita = citas[0]).
# Comprueba que cada dato esté dentro del texto de su ficha (sin tildes ni puntuación) y que la ficha no esté bloqueada.
# Los cromos del álbum anterior sin respaldo en los guiones NO entran (se listan en NO_ENTRAN).
# Uso: python -X utf8 herramientas/album_cromos.py [--eduardo ruta/cromos.json]
import json, re, sys, unicodedata, subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PAQUETE = RAIZ / 'contenido' / 'paquete.json'
SALIDA = RAIZ / 'contenido' / 'album.json'

CAPITULOS = [
    {'id': 'sendero', 'num': 'I', 'es': 'El sendero', 'en': 'The trail'},
    {'id': 'flora', 'num': 'II', 'es': 'Flora y paisaje', 'en': 'Plants and landscape'},
    {'id': 'fauna', 'num': 'III', 'es': 'Fauna', 'en': 'Wildlife'},
    {'id': 'historias', 'num': 'IV', 'es': 'Historias del guía', 'en': "Guide's stories"},
]

# (id, capitulo, como, estacion, arte, ficha, fichas extra, nombre si no viene de Eduardo, brillante)
# como: estacion = QR firmado, GPS o primera respuesta de Fray en la estación (o código del guía)
#       pregunta = Fray responde con esa ficha en una estación (o código del guía)
#       pausa    = dos minutos sin tocar el teléfono, en el parque
CROMOS = [
    ('brisas-agua', 'sendero', 'estacion', 'brisas', 'brisas', 'norte-brisas-introduccion', [], None, False),
    ('aguacerales-frailejon', 'sendero', 'estacion', 'aguacerales', 'frailejon', 'uton-frailejon-especies', [], None, False),
    ('arenales-dunas', 'sendero', 'estacion', 'arenales', 'e3', 'uton-dunas-no-pisar', [], None, False),
    ('lunares-gelifraccion', 'sendero', 'estacion', 'lunares', 'roca', 'uton-lunares-gelifraccion', [], None, False),
    ('tumbas-nombre', 'sendero', 'estacion', 'tumbas', 'tumbas', 'uton-tumbas-nombre', [], None, True),
    ('mirada', 'sendero', 'pausa', None, 'mirada', 'uton-biomas-parque', [], 'Mirada larga', False),
    ('aguacerales-condensacion', 'flora', 'pregunta', 'aguacerales', 'agua', 'uton-aguacerales-nombre', ['norte-aguacerales-niebla'], None, False),
    ('frailejon-necromasa', 'flora', 'pregunta', None, 'hojas', 'norte-frailejon-necromasa', ['uton-frailejon-adaptaciones'], 'Abrigo de hojas', False),
    ('lunares-loricaria', 'flora', 'pregunta', 'lunares', 'musgo', 'uton-lunares-vegetacion-tiempo', ['uton-loricarias', 'uton-lunares-paisaje'], None, False),
    ('pajonal', 'flora', 'pregunta', None, 'pajonal', 'uton-bosques-matorrales', [], 'Pajonal', False),
    ('andesitas', 'flora', 'pregunta', None, 'roca', 'uton-andesitas-edad', [], 'Andesitas', False),
    ('glaciar', 'flora', 'pregunta', None, 'nevado', 'uton-glaciar-ruiz-2022', ['norte-glaciar-cumbre'], 'El glaciar del Ruiz', False),
    ('condor', 'fauna', 'pregunta', None, 'condor', 'norte-fauna-condor-danta', [], None, True),
    ('danta', 'fauna', 'pregunta', None, 'danta', 'uton-grandes-mamiferos', [], 'Danta de páramo', False),
    ('periquito', 'fauna', 'pregunta', None, 'periquito', 'uton-aves-endemicas', [], 'Periquito de los Nevados', False),
    ('agua', 'historias', 'pregunta', None, 'laguna', 'uton-pnn-agua', [], 'Esponjas gigantes', False),
    ('arenales-esqui', 'historias', 'pregunta', 'arenales', 'huella', 'uton-arenales-historia-esqui', [], None, False),
    ('complejo-volcanico', 'historias', 'pregunta', None, 'tumbas', 'uton-complejo-volcanico', [], 'Cuatro volcanes en uno', False),
    ('tumbas-kumanday', 'historias', 'pregunta', 'tumbas', 'volcanes', 'uton-kumanday', ['norte-kumanday'], None, False),
]

# Cromos del álbum anterior (24) que no entran en esta versión: su dato venía de otras fuentes y no hay ficha equivalente
# en los guiones, o necesitan la cámara (Lente o foto de grupo).
NO_ENTRAN = {
    'e2 Frío de altura': 'el dato venía de PNN 2019; no hay ficha con ese dato',
    'grupo Cromo de grupo': 'necesita la cámara (foto de grupo); sin dato de los guiones',
    'sietecueros Siete cueros': 'los guiones solo nombran Polylepis de pasada; sin ficha propia',
    'musgo Musgos y líquenes': 'solo aparece en listas de plantas de las fichas de estación',
    'laguna Laguna': 'solo hay una definición de glosario',
    'oso Oso de anteojos': 'no aparece en los guiones',
    'pato Pato andino': 'los guiones no traen una frase propia del pato',
    'aguila Águila de páramo': 'solo aparece en listas de fauna de las estaciones',
    'sombrilla Especies sombrilla': 'no aparece en los guiones',
    'volcanes Tres volcanes': 'la fecha de creación venía de PNN 2019',
}


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def cromos_eduardo(ruta):
    if ruta:
        return json.loads(Path(ruta).read_text(encoding='utf-8'))
    txt = subprocess.run(['git', 'show', 'origin/eduardo/cromos:contenido/cromos.json'], cwd=RAIZ,
                         capture_output=True, text=True, encoding='utf-8', check=True).stdout
    return json.loads(txt)


def main():
    ruta = sys.argv[sys.argv.index('--eduardo') + 1] if '--eduardo' in sys.argv else None
    ed = {c['id']: c for c in cromos_eduardo(ruta)['cromos']}
    paquete = json.loads(PAQUETE.read_text(encoding='utf-8'))
    fichas = {f['id']: f for f in paquete['fichas']}
    salida, avisos = [], []
    for n, (cid, cap, como, est, arte, fid, extra, nombre, brillante) in enumerate(CROMOS, 1):
        f = fichas[fid]
        assert not f.get('bloqueada'), f'{cid}: la ficha {fid} está bloqueada'
        if cid in ed:
            e = ed[cid]
            dato, cita, nombre, tipo = e['dato'], e['cita'], e['nombre'], e.get('tipo', 'ciencia')
            origen = 'eduardo/cromos'
        else:
            dato, cita, tipo = f['breve'], f['citas'][0], ('relato' if f['tipo'] == 'relato' else 'ciencia')
            origen = f'paquete:{fid}'
        if norm(dato) not in norm(f['texto']):
            avisos.append(f'{cid}: el dato no aparece tal cual en el texto de la ficha {fid} (revísalo contra el PDF)')
        salida.append({
            'id': cid, 'n': n, 'capitulo': cap, 'como': como, 'estacion': est, 'arte': arte,
            'nombre': nombre, 'tipo': tipo, 'dato': dato, 'cita': {'guion': cita['guion'], 'pagina': cita['pagina']},
            'ficha': fid, 'fichas': [fid, *extra], 'brillante': brillante, 'origen': origen,
            **({'segundos': 120} if como == 'pausa' else {}),
        })
    doc = {
        'nota': 'Generado por herramientas/album_cromos.py. Cada dato es literal de un guion con su página (PDF). No editar a mano.',
        'version': paquete['version'],
        'capitulos': CAPITULOS,
        'cromos': salida,
        'noEntran': NO_ENTRAN,
    }
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(salida)} cromos en {SALIDA.relative_to(RAIZ)}')
    for a in avisos:
        print('AVISO:', a)


if __name__ == '__main__':
    main()
