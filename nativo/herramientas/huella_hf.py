"""Imprime la entrada de assets/modelos.json para un archivo de Hugging Face (tamaño y SHA-256 de la API, sin descargarlo).

Uso: python herramientas/huella_hf.py Qwen/Qwen2.5-1.5B-Instruct-GGUF qwen2.5-1.5b-instruct-q4_k_m.gguf
Solo corre en el PC; la app nunca llama a la API.
"""
import json, sys, urllib.request

repo, archivo = sys.argv[1], sys.argv[2]
with urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}?blobs=true', timeout=60) as r:
    info = json.load(r)
s = next((x for x in info['siblings'] if x['rfilename'] == archivo), None)
if not s or not s.get('lfs'):
    sys.exit(f'{archivo} no está en {repo} o no es un archivo LFS')
print(json.dumps({
    'id': archivo.lower().replace('.gguf', '').replace('.litertlm', ''),
    'nombre': archivo,
    'archivo': archivo,
    'url': f'https://huggingface.co/{repo}/resolve/main/{archivo}',
    'sha256': s['lfs']['sha256'],
    'bytes': s['size'],
    'licencia': (info.get('cardData') or {}).get('license', '?'),
    'motor': 'litertlm' if archivo.endswith('.litertlm') else 'gguf',
    'sinRazonar': False,
}, ensure_ascii=False, indent=2))
