# Puts the picture of a ready-made slide into the authoring folder: pictures/designs/<id>.webp,
# and its size in pixels as pictures/designs/<id>.json.
#   python3 design-picture.py <id> <source.png> [quality]
import json, os, sys
from PIL import Image
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pictures', 'designs')
name, src, *rest = sys.argv[1:]
quality = int(rest[0]) if rest else 84
os.makedirs(A, exist_ok=True)
im = Image.open(src)
im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
# A picture with no transparent pixel is kept without its alpha channel.
if im.mode == 'RGBA' and im.getextrema()[3][0] == 255:
    im = im.convert('RGB')
out = os.path.join(A, f'{name}.webp')
im.save(out, 'WEBP', quality=quality, method=6)
json.dump(list(im.size), open(os.path.join(A, f'{name}.json'), 'w'))
print(name, im.size, im.mode, os.path.getsize(out))
