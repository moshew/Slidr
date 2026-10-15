# The portraits of the Shvav sample (team): the nof-team-1..4 set, mapped to the board's colours:
# deep solder-mask green in the shadows, copper in the mid-tones and warm cream in the light, with a
# tone curve and a vignette that darken the wall behind each face. For each n in 1..4:
#   python3 shvav-portraits.py nof-team-n.webp shvav-team-n.png 1.7 0.8 '#021a13@0' '#245a40@0.38' '#c08a52@0.7' '#f8e9c8@1'
# then pictures.py shvav-team-n shvav-team-n.png 84
import sys
from PIL import Image, ImageOps
import numpy as np
src, out, gamma, vig, *stops = sys.argv[1:]
def rgb(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16) for i in (0,2,4)], float)
st = [(rgb(s.split('@')[0]), float(s.split('@')[1])) for s in stops]
im = Image.open(src).convert('RGB')
g = np.asarray(ImageOps.autocontrast(ImageOps.grayscale(im), cutoff=1), float) / 255
g = g ** float(gamma)
h, w = g.shape
yy, xx = np.mgrid[0:h, 0:w]
r = np.sqrt(((xx - w/2)/(w/2))**2 + ((yy - h*0.42)/(h/2))**2)
g = g * (1 - float(vig) * np.clip(r - 0.35, 0, 1) ** 1.4)
res = np.zeros((h, w, 3))
for (ca, ta), (cb, tb) in zip(st, st[1:]):
    m = (g >= ta) & (g <= tb)
    t = ((g - ta) / (tb - ta))[..., None]
    res = np.where(m[..., None], ca + (cb - ca) * t, res)
Image.fromarray(res.clip(0, 255).astype('uint8')).save(out)
