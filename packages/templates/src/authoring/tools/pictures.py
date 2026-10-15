# Writes pictures into the authoring folder as webp and records them in pictures.json.
#   python3 pictures.py <name> <source.png> [quality]   e.g. kod-editor shots/kod-editor.png
import hashlib, json, os, re, sys
from PIL import Image
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pictures')
name, src, *rest = sys.argv[1:]
quality = int(rest[0]) if rest else 84
os.makedirs(A, exist_ok=True)
im = Image.open(src)
im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
out = os.path.join(A, f'{name}.webp')
im.save(out, 'WEBP', quality=quality, method=6)
data = open(out, 'rb').read()
sha = hashlib.sha256(data).hexdigest()
key = re.sub(r'-(\w)', lambda m: m.group(1).upper(), name)
# One file a template, named by the first part of the picture's name: kod-editor -> kod.json.
manifest_path = os.path.join(A, name.split('-')[0] + '.json')
manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
manifest[key] = {
    'id': sha, 'file': f'{sha}.webp', 'mime': 'image/webp', 'kind': 'image',
    'bytes': len(data), 'width': im.size[0], 'height': im.size[1], 'origin': 'ai' if 'team' in name else 'import',
    'name': f'{name}.webp',
}
json.dump(manifest, open(manifest_path, 'w'), indent=2)
print(key, im.size, len(data))
