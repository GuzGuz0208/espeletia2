# Ajusta paquete.json (el del Álbum del Páramo original de Eduardo, rama r2/instalar) a las reglas de Fray:
# - Cada cromo apunta a su respaldo en los guiones: `guion: {ficha, clave?, cromo?}`. En el teléfono, js/estado.js toma el
#   dato LITERAL y la cita (guion + página) del contenido del parque, con vigencia de 24 h (contrato §7):
#     cromo → contenido/cromos.json (dato de Eduardo, literal);  si no, la ficha de contenido/paquete.json:
#     clave → la frase del texto de la ficha que contiene esa palabra;  si no, `breve`.
# - Quita del paquete.json los datos redactados de los cromos (es/en.dato, fuente, pagina): no son texto del guion.
# - Quita el PIN del guía (ahora es el PIN por dispositivo de js/panel-pin.js), las paradas narradas (venían de PNN 2019,
#   no de los guiones) y el horario (información cambiante: la da el personal).
# Uso: python -X utf8 herramientas/album_original.py [--revisar]   (--revisar solo imprime el dato de cada cromo)
import json, re, sys, unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ALBUM = RAIZ / 'paquete.json'
CONTENIDO = json.loads((RAIZ / 'contenido' / 'paquete.json').read_text(encoding='utf-8'))
EDUARDO = json.loads((RAIZ / 'contenido' / 'cromos.json').read_text(encoding='utf-8'))

# id del cromo (álbum original) → (ficha de contenido/paquete.json, palabra clave de la frase, cromo de contenido/cromos.json)
GUION = {
    'brisas': ('norte-brisas-introduccion', None, 'brisas-agua'),
    'e2': ('uton-aguacerales-nombre', None, 'aguacerales-condensacion'),
    'e3': ('uton-arenales-dunas', None, None),
    'lunares': ('uton-lunares-gelifraccion', None, 'lunares-gelifraccion'),
    'tumbas': ('uton-tumbas-nombre', None, 'tumbas-nombre'),
    'mirada': ('uton-biomas-parque', None, None),
    'grupo': ('uton-paramo-socioecosistema', None, None),
    'frailejon': ('uton-frailejon-especies', None, 'aguacerales-frailejon'),
    'hojas': ('norte-frailejon-necromasa', None, None),
    'pajonal': ('uton-bosques-matorrales', None, None),
    'sietecueros': ('uton-bosques-matorrales', 'Polylepis', None),
    'musgo': ('uton-aguacerales-nombre', 'musgos', None),
    'laguna': ('uton-bachue-lugares-sagrados', None, None),
    'roca': ('uton-andesitas-edad', None, None),
    'nevado': ('norte-glaciar-cumbre', None, None),
    'condor': ('norte-fauna-condor-danta', None, 'condor'),
    'puma': ('uton-grandes-mamiferos', 'Puma', None),
    'danta': ('norte-fauna-condor-danta', 'dispersor', None),
    'periquito': ('uton-aves-endemicas', None, None),
    'pato': ('uton-aves-endemicas', 'pato', None),
    'aguila': ('uton-lunares-ficha', 'águila', None),
    'agua': ('norte-clima-bimodal-suelo', 'esponja', None),
    'armero': ('uton-armero-1985', None, None),
    'esqui': ('uton-arenales-historia-esqui', None, 'arenales-esqui'),
    'nombres': ('uton-aguacerales-nombre', 'de allí el nombre', None),
}


def frases(texto):
    return [f.strip() for f in re.split(r'(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿«"\'(])', texto) if f.strip()]


def dato(fid, clave, cromo):
    if cromo:
        c = next(k for k in EDUARDO['cromos'] if k['id'] == cromo)
        return c['dato'], c['cita']
    f = next(k for k in CONTENIDO['fichas'] if k['id'] == fid)
    assert not f.get('bloqueada'), fid
    if clave:
        fr = next((x for x in frases(f['texto']) if clave.lower() in x.lower()), None)
        assert fr, f'{fid}: no hay frase con «{clave}»'
        # Ficha de varias páginas: no se sabe en cuál está la frase → se citan todas las del mismo guion
        g = f['citas'][0]['guion']
        pags = sorted({c['pagina'] for c in f['citas'] if c['guion'] == g})
        return fr, {'guion': g, 'pagina': pags[0] if len(pags) == 1 else f'{pags[0]}–{pags[-1]}'}
    return f['breve'], f['citas'][0]


def main():
    p = json.loads(ALBUM.read_text(encoding='utf-8'))
    for c in p['cromos']:
        fid, clave, cromo = GUION[c['id']]
        d, cita = dato(fid, clave, cromo)
        if '--revisar' in sys.argv:
            print(f"{c['n']:>2} {c['id']:<12} {cita['guion']} p. {cita['pagina']}: {d[:150]}")
            continue
        c['guion'] = {k: v for k, v in {'ficha': fid, 'clave': clave, 'cromo': cromo}.items() if v}
        for lang in ('es', 'en'):
            c.get(lang, {}).pop('dato', None)
        c.pop('fuente', None)
        c.pop('pagina', None)
    if '--revisar' in sys.argv:
        return
    p.get('guia', {}).pop('pin', None)
    p['paradas'] = []
    p.pop('horario', None)
    ALBUM.write_text(json.dumps(p, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f"{len(p['cromos'])} cromos con respaldo en los guiones")


if __name__ == '__main__':
    main()
