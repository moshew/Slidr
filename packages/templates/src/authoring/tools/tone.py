# Colour treatments for portraits: python3 tone.py <in> <out.png> <mode> [args]
#   duotone <dark> <light> [keep]   map luminance between two colours, keep a share of the original colour
#   tritone <c0> <c1> <c2> [keep]
import sys
from PIL import Image, ImageOps, ImageEnhance
src, out, mode, *rest = sys.argv[1:]
im = Image.open(src).convert('RGB')
def hexrgb(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
g = ImageOps.grayscale(im)
g = ImageOps.autocontrast(g, cutoff=1)
if mode == 'duotone':
    toned = ImageOps.colorize(g, hexrgb(rest[0]), hexrgb(rest[1]))
    keep = float(rest[2]) if len(rest) > 2 else 0
elif mode == 'tritone':
    toned = ImageOps.colorize(g, hexrgb(rest[0]), hexrgb(rest[2]), mid=hexrgb(rest[1]))
    keep = float(rest[3]) if len(rest) > 3 else 0
else:
    raise SystemExit('mode?')
if keep: toned = Image.blend(toned, im, keep)
toned.save(out)
