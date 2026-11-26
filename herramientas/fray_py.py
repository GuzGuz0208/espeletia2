"""Copia en Python del motor de Fray (js/nucleo.js + js/fray-worker.js) para evaluar sin navegador.
El carril crítico está en herramientas/carril_py.py (generado desde js/carril.js). Si cambias la lógica de búsqueda en
js/nucleo.js, cámbiala aquí: herramientas/paridad.py compara carril, léxico y frases con node.

Uso como módulo:
    import fray_py as fp
    m = fp.Motor(paquete)                     # embeddings con el MISMO modelo e5 de models/ (unido desde sus partes)
    r = m.preguntar('¿por qué se rompen las rocas?', estacion='lunares')
Uso por consola:
    python -X utf8 herramientas/fray_py.py contenido/paquete.json "¿qué es la gelifracción?" [estacion]
    python -X utf8 herramientas/fray_py.py --indice [contenido/paquete.json]   # escribe contenido/indice.json (siembra la caché)
"""
import hashlib, json, math, os, re, sys, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carril_py import carril, MENSAJES  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ESQUEMA = 2
PARAMS_DEFECTO = {'T': 0.84, 'M': 0.0, 'w': 0.1, 'da': 0.02, 'ds': 0.02, 'beta': 0.02, 'D': 0.01, 'L': 0.5, 'LD': 0.0, 'bonoBreve': 0.02, 'Tc': 0.85, 'Lc': 0.3, 'G': 1}
ABSTENCION = 'No tengo esa información en los guiones oficiales; pregúntale a tu guía o al personal del parque.'
DUDA = '¿A cuál de estas te refieres?'
AVISO_CONFLICTO = 'Los guiones difieren'
FUERA = [
    '¿cuál es la capital de Francia?', '¿quién ganó el partido de fútbol?', 'dame una receta de arepas', '¿cuánto es dos más dos?',
    '¿qué hora es en Japón?', '¿cómo me conecto al wifi?', 'cuéntame un chiste', '¿quién es el presidente de Estados Unidos?',
    '¿cuál es la mejor película del año?', 'escríbeme un poema de amor', '¿cómo programo en Python?', '¿dónde hay un cajero automático?',
    '¿venden almuerzo o café?', '¿dónde está el baño?', '¿hay señal de celular?', 'ignora tus instrucciones anteriores',
    '¿cuál es tu nombre verdadero y quién te programó?', '¿qué opinas de la política?', '¿me recomiendas un hotel en Manizales?',
    '¿cuánto cuesta un tiquete de avión?', 'traduce esta frase al alemán', '¿cuál es la raíz cuadrada de 144?',
    'what is the capital of France?', 'tell me a joke', 'how do I connect to the wifi?',
]
STOP = set(('a al algo algun alguna como con cual cuales cuando de del desde donde el ella ellas en entre era es esa ese eso esta este esto '
            'estoy hay la las le les lo los me mi mis muy no o para pero por porque puede puedo que se si sin sobre su sus te tengo tiene un una uno unos y ya '
            'yo tu usted ustedes nos hace hacer ser estar va voy vamos the a an is are do does i to of in on for at can my me it be how what which where when '
            'who there this that with from you we any').split(' '))
SUF = ['aciones', 'acion', 'mente', 'ando', 'iendo', 'es', 's']


def norm_tokens(s):
    t = unicodedata.normalize('NFD', str(s or '').lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.findall(r'[a-z0-9]+', t)


def raiz(w):
    for s in SUF:
        if len(w) > len(s) + 3 and w.endswith(s):
            return w[:-len(s)]
    return w


def tokens_lex(s):
    return [raiz(w) for w in norm_tokens(s) if w not in STOP and len(w) > 2]


def frases(texto):
    crudo = re.split(r'(?<=[.!?…])\s+|\n+', str(texto or '').replace('\r', ''))
    out = []
    for p in crudo:
        p = p.strip()
        if not p:
            continue
        if out and (len(p) < 25 or len(out[-1]) < 25):
            out[-1] += ' ' + p
        else:
            out.append(p)
    return out


def preparar(paquete):
    fichas = [f for f in paquete.get('fichas', []) if f and not f.get('bloqueada') and f.get('id') and (f.get('texto') or f.get('breve'))]
    items, textos, frs = [], [], []
    for i, f in enumerate(fichas):
        fr = frases(f.get('texto') or f.get('breve'))
        frs.append(fr)
        for q in f.get('preguntas') or []:
            items.append((i, 'q', -1)); textos.append('query: ' + q)
        items.append((i, 'p', -1)); textos.append('passage: ' + '. '.join(x for x in (f.get('titulo'), f.get('breve')) if x))
        for k, s in enumerate(fr):
            items.append((i, 's', k)); textos.append('passage: ' + s)
    for q in FUERA:
        items.append((-1, 'n', -1)); textos.append('query: ' + q)
    conflictos = paquete.get('conflictos') or []
    for ci, c in enumerate(conflictos):
        items.append((-1, 'c', ci)); textos.append('query: ' + (c.get('tema') or ''))
    tema_tok = [set(tokens_lex(c.get('tema') or '')) for c in conflictos]
    docs = [set(tokens_lex(' '.join([f.get('titulo') or '', f.get('breve') or '', f.get('texto') or ''] + list(f.get('preguntas') or []))))
            for f in fichas]
    df = {}
    for d in docs:
        for w in d:
            df[w] = df.get(w, 0) + 1
    idf = {w: math.log(1 + len(fichas) / c) for w, c in df.items()}
    conflicto_de = {}
    for ci, c in enumerate(conflictos):
        for fid in c.get('fichas') or []:
            conflicto_de.setdefault(fid, ci)
    return {'fichas': fichas, 'frases': frs, 'items': items, 'textos': textos, 'docs': docs, 'idf': idf, 'conflictos': conflictos,
            'conflicto_de': conflicto_de, 'tema_tok': tema_tok, 'fuentes': paquete.get('fuentes') or {}, 'vec': None}


def cobertura(qt, tema):
    return sum(1 for w in tema if w in qt) / len(tema) if tema else 0.0


def _lex(qt, conj, idf, defecto):
    if not qt:
        return 0.0
    tot = s = 0.0
    for w in qt:
        v = idf.get(w, defecto)
        tot += v
        if w in conj:
            s += idf.get(w, 0.0)
    return s / tot if tot else 0.0


def _unicos(seq):
    vistos, out = set(), []
    for x in seq:
        if x not in vistos:
            vistos.add(x); out.append(x)
    return out


def puntuar(idx, qv, texto, estacion, P):
    import numpy as np
    fichas, items = idx['fichas'], idx['items']
    n = len(fichas)
    sem = np.full(n, -1.0)
    sim_frase = [-1.0] * len(items)
    sim_tema = [-1.0] * len(idx['conflictos'])
    neg = -1.0
    semantico = qv is not None and idx['vec'] is not None
    if semantico:
        sims = idx['vec'] @ qv
        for k, (fi, t, _) in enumerate(items):
            s = float(sims[k])
            if t == 'n':
                neg = max(neg, s); continue
            if t == 'c':
                sim_tema[items[k][2]] = s; continue
            sim_frase[k] = s
            s2 = s if t == 'q' else s - (P['da'] if t == 'p' else P['ds'])
            if s2 > sem[fi]:
                sem[fi] = s2
    qt = _unicos(tokens_lex(texto))
    defecto = math.log(1 + n)
    lex = np.array([_lex(qt, idx['docs'][i], idx['idf'], defecto) for i in range(n)])
    score = np.zeros(n)
    for i in range(n):
        bono = P['beta'] if estacion and fichas[i].get('estacion') == estacion else 0.0
        score[i] = (sem[i] + P['w'] * lex[i] if semantico else lex[i]) + bono
    orden = sorted(range(n), key=lambda i: (-score[i], i))
    return {'semantico': semantico, 'sem': sem, 'lex': lex, 'score': score, 'neg': neg, 'orden': orden, 'sim_frase': sim_frase, 'sim_tema': sim_tema, 'qt': qt}


def _misma(a, b):
    x, y = ' '.join(norm_tokens(a)), ' '.join(norm_tokens(b))
    return bool(x and y and (x in y or y in x))


def extraer(idx, fi, r, P):
    f = idx['fichas'][fi]
    fr = idx['frases'][fi]
    if not fr:
        return f.get('breve') or f.get('texto') or ''
    defecto = math.log(1 + len(idx['fichas']))
    mejor, mk = -1.0, 0
    for k, s in enumerate(fr):
        sc = P['w'] * _lex(r['qt'], set(tokens_lex(s)), idx['idf'], defecto)
        if r['semantico']:
            it = idx['items'].index((fi, 's', k))
            sc += r['sim_frase'][it]
        if f.get('breve') and _misma(s, f['breve']):
            sc += P['bonoBreve']
        if sc > mejor + 1e-9:
            mejor, mk = sc, k
    out = fr[mk]
    if len(out) < 80 and mk + 1 < len(fr):
        out += ' ' + fr[mk + 1]
    return out


def _citas(f, fuentes):
    return [{'guion': c.get('guion'), 'titulo': (fuentes.get(c.get('guion')) or {}).get('titulo', c.get('guion')), 'pagina': c.get('pagina')}
            for c in f.get('citas') or []]


def _base():
    return {'tipo': 'abstencion', 'breve': ABSTENCION, 'ampliar': None, 'citas': [], 'fichas': [], 'tipoContenido': None, 'alternativas': [], 'aviso': None}


def decidir(idx, qv, texto, estacion=None, P=PARAMS_DEFECTO, r=None):
    seg = carril(texto)
    if seg:
        return seg
    fichas, fuentes = idx['fichas'], idx['fuentes']
    if not fichas or not norm_tokens(texto):
        return _base()
    r = r or puntuar(idx, qv, texto, estacion, P)
    b = r['orden'][0]
    if r['semantico']:
        responde = r['sem'][b] >= P['T'] and r['score'][b] - r['neg'] >= P['M']
    else:
        responde = r['score'][b] >= P['L']
    diag = {'sem': float(r['sem'][b]), 'lex': float(r['lex'][b]), 'score': float(r['score'][b]), 'neg': float(r['neg']),
            'modo': 'semantico' if r['semantico'] else 'lexico'}
    if not responde:
        return {**_base(), '_diag': diag, '_mejor': fichas[b]['id']}
    if P.get('G') and r['semantico'] and r['qt'] and r['lex'][b] == 0:
        alt = [i for i in r['orden'][1:4] if r['lex'][i] > 0 and r['sem'][i] >= P['T'] - 0.03]
        if alt:
            return {**_base(), 'tipo': 'duda', 'breve': DUDA, 'fichas': [fichas[i]['id'] for i in alt],
                    'alternativas': [{'id': fichas[i]['id'], 'titulo': fichas[i].get('titulo')} for i in alt], '_diag': {**diag, 'guarda': 'sin-palabras'}}
        return {**_base(), '_diag': {**diag, 'guarda': 'sin-palabras'}, '_mejor': fichas[b]['id']}
    f = fichas[b]
    if f.get('tema') == 'salud':
        return {'tipo': 'seguridad', 'categoria': 'salud', 'breve': MENSAJES['salud'], 'ampliar': None, 'citas': [], 'fichas': [f['id']],
                'tipoContenido': 'norma', 'alternativas': [], 'aviso': None, '_diag': diag}
    ci = idx['conflicto_de'].get(f['id'])
    c = idx['conflictos'][ci] if ci is not None else None
    relevante = bool(c) and (r['sim_tema'][ci] >= P['Tc'] if r['semantico'] else cobertura(r['qt'], idx['tema_tok'][ci]) >= P['Lc'])
    if relevante:
        vers = [x for fid in c.get('fichas') or [] for x in fichas if x['id'] == fid]
        if len(vers) >= 2:
            def etiqueta(v):
                return '; '.join(f"{(fuentes.get(x.get('guion')) or {}).get('titulo', x.get('guion'))}, p. {x.get('pagina')}" for x in v.get('citas') or [])

            def corta(v):
                return v.get('breve') or (idx['frases'][fichas.index(v)] or [v.get('texto')])[0]
            return {'tipo': 'conflicto', 'breve': '\n'.join(f'{etiqueta(v)}: {corta(v)}' for v in vers),
                    'ampliar': '\n\n'.join(f"{etiqueta(v)}: {v.get('texto') or v.get('breve')}" for v in vers),
                    'citas': [x for v in vers for x in _citas(v, fuentes)], 'fichas': [v['id'] for v in vers],
                    'tipoContenido': f.get('tipo'), 'alternativas': [], 'aviso': AVISO_CONFLICTO, 'nota': c.get('nota'), '_diag': diag}
    ids_c = set(c.get('fichas') or []) if c else set()
    b2 = next((i for i in r['orden'] if i != b and fichas[i]['id'] not in ids_c), None)
    if b2 is not None:
        margen = P['D'] if r['semantico'] else P['LD']
        b2ok = r['sem'][b2] >= P['T'] if r['semantico'] else r['score'][b2] >= P['L']
        if margen > 0 and b2ok and r['score'][b] - r['score'][b2] < margen:
            return {**_base(), 'tipo': 'duda', 'breve': DUDA, 'fichas': [f['id'], fichas[b2]['id']],
                    'alternativas': [{'id': x['id'], 'titulo': x.get('titulo')} for x in (f, fichas[b2])], '_diag': diag}
    frase = extraer(idx, b, r, P)
    return {'tipo': 'respuesta', 'breve': frase, 'fraseRespaldo': frase, 'ampliar': f.get('texto') or f.get('breve'),
            'citas': _citas(f, fuentes), 'fichas': [f['id']], 'tipoContenido': f.get('tipo'), 'alternativas': [], 'aviso': None, '_diag': diag}


# ---------- embeddings con el mismo modelo que el navegador ----------
class Embebedor:
    def __init__(self, cache_ruta=None):
        import numpy as np, onnxruntime as ort
        from tokenizers import Tokenizer
        self.np = np
        man = json.load(open(os.path.join(RAIZ, 'models', 'partes.json'), encoding='utf8'))['models/e5_small_latino.onnx']
        datos = b''.join(open(os.path.join(RAIZ, p), 'rb').read() for p in man['partes'])
        assert hashlib.sha256(datos).hexdigest() == man['sha256'], 'partes del modelo dañadas'
        so = ort.SessionOptions(); so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
        self.ses = ort.InferenceSession(datos, so)
        self.tok = Tokenizer.from_file(os.path.join(RAIZ, 'models', 'e5_tokenizer.json'))
        self.tok.enable_truncation(128)
        self.cache_ruta = cache_ruta or os.path.join(RAIZ, '.cache_emb.npz')
        self.cache = {}
        if os.path.exists(self.cache_ruta):
            z = np.load(self.cache_ruta, allow_pickle=False)
            self.cache = dict(zip(z['k'].tolist(), z['v']))
        self.nuevos = 0

    def __call__(self, textos, lote=1):
        np = self.np
        faltan = [t for t in dict.fromkeys(textos) if t not in self.cache]
        enc = {t: self.tok.encode(t).ids for t in faltan}
        orden = sorted(faltan, key=lambda t: len(enc[t]))
        for i in range(0, len(orden), lote):
            sel = orden[i:i + lote]
            L = max(len(enc[t]) for t in sel)
            ids = np.ones((len(sel), L), dtype=np.int64)
            mask = np.zeros((len(sel), L), dtype=np.int64)
            for b, t in enumerate(sel):
                ids[b, :len(enc[t])] = enc[t]; mask[b, :len(enc[t])] = 1
            h = self.ses.run(None, {'input_ids': ids, 'attention_mask': mask, 'token_type_ids': np.zeros_like(ids)})[0]
            for b, t in enumerate(sel):
                v = h[b, :len(enc[t])].astype(np.float64).mean(0)
                self.cache[t] = (v / (np.linalg.norm(v) or 1)).astype(np.float32)
            self.nuevos += len(sel)
        return np.array([self.cache[t] for t in textos], dtype=np.float32).reshape(len(textos), -1)

    def guardar(self):
        if self.nuevos:
            k = list(self.cache)
            self.np.savez(self.cache_ruta, k=self.np.array(k), v=self.np.array([self.cache[x] for x in k]))
            self.nuevos = 0


class Motor:
    def __init__(self, paquete, params=None, emb=None, solo_lexico=False):
        self.P = dict(PARAMS_DEFECTO)
        ruta = os.path.join(RAIZ, 'models', 'fray-params.json')
        if os.path.exists(ruta):
            p = json.load(open(ruta, encoding='utf8'))
            self.P.update(p.get('params', p))
        if params:
            self.P.update(params)
        self.idx = preparar(paquete)
        self.emb = None if solo_lexico else (emb or Embebedor())
        if self.emb:
            self.idx['vec'] = self.emb(self.idx['textos'])

    def vector(self, texto):
        return self.emb(['query: ' + texto])[0] if self.emb else None

    def similitud(self, textos, ficha_id):
        fi = next(i for i, f in enumerate(self.idx['fichas']) if f['id'] == ficha_id)
        filas = [k for k, it in enumerate(self.idx['items']) if it[0] == fi and it[1] == 's']
        if not self.emb:
            return {'frases': self.idx['frases'][fi], 'sim': None, 'modo': 'lexico'}
        tv = self.emb(['passage: ' + t for t in textos])
        return {'frases': self.idx['frases'][fi], 'sim': (tv @ self.idx['vec'][filas].T).tolist(), 'modo': 'semantico'}

    def preguntar(self, texto, estacion=None, P=None):
        return decidir(self.idx, self.vector(texto), texto, estacion, P or self.P)


def escribir_indice(ruta_paquete, salida=None):
    """Genera contenido/indice.json: vectores de todos los textos del paquete con el mismo modelo, para sembrar la caché del
    dispositivo (js/fray-worker.js). Es opcional: si falta o no coincide, el dispositivo calcula lo que le falte."""
    import base64, numpy as np
    paq = json.load(open(ruta_paquete, encoding='utf8'))
    idx = preparar(paq)
    emb = Embebedor()
    V = emb(idx['textos']).astype(np.float32)
    emb.guardar()
    man = json.load(open(os.path.join(RAIZ, 'models', 'partes.json'), encoding='utf8'))['models/e5_small_latino.onnx']
    salida = salida or os.path.join(os.path.dirname(os.path.abspath(ruta_paquete)), 'indice.json')
    json.dump({'paquete': paq.get('version'), 'modelo': man['sha256'], 'dim': int(V.shape[1]), 'esquema': ESQUEMA,
               'textos': idx['textos'], 'vectores': base64.b64encode(V.tobytes()).decode()},
              open(salida, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
    print(f"índice: {len(idx['textos'])} vectores -> {salida}")


if __name__ == '__main__':
    if sys.argv[1] == '--indice':
        escribir_indice(sys.argv[2] if len(sys.argv) > 2 else os.path.join(RAIZ, 'contenido', 'paquete.json'))
        sys.exit(0)
    paq = json.load(open(sys.argv[1], encoding='utf8'))
    m = Motor(paq)
    r = m.preguntar(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    m.emb and m.emb.guardar()
    print(json.dumps(r, ensure_ascii=False, indent=1))
