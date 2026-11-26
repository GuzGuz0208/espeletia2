"""Imprime la entrada de assets/modelo.json para un GGUF de Hugging Face (tamaño y SHA-256 de la API, sin descargarlo).

Uso: python nativo/herramientas/huella_hf.py unsloth/Qwen3.5-0.8B-GGUF Qwen3.5-0.8B-Q4_K_M.gguf
Usa huggingface_hub (model_info files_metadata=True) si está instalado; si no, la API pública. Solo corre en el PC.
"""
import json, sys, urllib.request

repo, archivo = sys.argv[1], sys.argv[2]
try:
    from huggingface_hub import HfApi
    info = HfApi().model_info(repo, files_metadata=True)
    s = next((x for x in info.siblings if x.rfilename == archivo), None)
    if not s or not s.lfs:
        sys.exit(f'{archivo} no está en {repo} o no es un archivo LFS')
    sha, tam, lic = s.lfs.sha256, s.size, (info.card_data or {}).get('license', '?')
except ImportError:
    with urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}?blobs=true', timeout=60) as r:
        info = json.load(r)
    s = next((x for x in info['siblings'] if x['rfilename'] == archivo), None)
    if not s or not s.get('lfs'):
        sys.exit(f'{archivo} no está en {repo} o no es un archivo LFS')
    sha, tam, lic = s['lfs']['sha256'], s['size'], (info.get('cardData') or {}).get('license', '?')

print(json.dumps({
    'id': archivo.lower().replace('.gguf', ''),
    'nombre': archivo,
    'repo': repo,
    'archivo': archivo,
    'url': f'https://huggingface.co/{repo}/resolve/main/{archivo}',
    'sha256': sha,
    'bytes': tam,
    'licencia': lic,
    'sinRazonar': 'qwen3' in archivo.lower(),
    'nota': '',
}, ensure_ascii=False, indent=2))
