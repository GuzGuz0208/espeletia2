"""Corre el motor real (herramientas/fray_py.py) sobre contenido/preguntas_desarrollo.json y guarda, por pregunta, el objeto r
del contrato tal como lo recibiría el generador en la app. Lo usa herramientas/evaluar_generador.mjs --respuestas.
    python -X utf8 herramientas/respuestas_motor.py [salida.json] [--tipos respuesta,conflicto]
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fray_py as fp  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
tipos = 'respuesta,conflicto'
if '--tipos' in sys.argv:
    tipos = sys.argv[sys.argv.index('--tipos') + 1]
salida = args[0] if args else os.path.join(RAIZ, 'pruebas', 'respuestas_motor.json')
paq = json.load(open(os.path.join(RAIZ, 'contenido', 'paquete.json'), encoding='utf8'))
pd = json.load(open(os.path.join(RAIZ, 'contenido', 'preguntas_desarrollo.json'), encoding='utf8'))
t0 = time.time()
m = fp.Motor(paq)
print(f'motor listo en {time.time() - t0:.1f} s ({len(paq["fichas"])} fichas, paquete {paq.get("version")})')
out = []
for q in pd['preguntas']:
    esp = q['esperado']
    if esp['tipo'] not in tipos.split(','):
        continue
    r = m.preguntar(q['p'], q.get('estacion'))
    acierto = bool(set(r.get('fichas') or []) & set(esp.get('fichas') or [])) or (r.get('tipo') == esp['tipo'] and esp['tipo'] != 'respuesta')
    out.append({'pregunta': q['p'], 'estacion': q.get('estacion'), 'esperado': esp, 'r': r, 'ficha_correcta': acierto})
    print(f"{r.get('tipo'):<10} {'ok ' if acierto else 'MAL'} {(r.get('fichas') or ['-'])[0]:<34} {q['p']}")
json.dump({'paquete': paq.get('version'), 'casos': out}, open(salida, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(f'{len(out)} casos -> {salida}')
