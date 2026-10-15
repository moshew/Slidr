# Magen portraits: cold steel duotone, a signal-red rim along the subject's edge on one side,
# a faint red haze in the ground there, scanlines and a vignette.
#   python3 -I portrait.py <in> <out.png> [left|right]
import sys
import numpy as np
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]
side = sys.argv[3] if len(sys.argv) > 3 else 'right'
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32) / 255.0
R, G, B = a[..., 0], a[..., 1], a[..., 2]
h, w = R.shape
lum = 0.2126 * R + 0.7152 * G + 0.0722 * B
lo, hi = np.percentile(lum, 1), np.percentile(lum, 99.5)
l = np.clip((lum - lo) / (hi - lo), 0, 1)
l = l * l * (3 - 2 * l) * 0.5 + l * 0.5
# The subject: whatever is not the purple ground.
purple = np.clip((np.minimum(R, B) - G - 0.02) * 8.0, 0, 1)
pm = Image.fromarray((purple * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(2))
purple = np.asarray(pm).astype(np.float32) / 255
subject = 1 - purple
l = l * (1 - 0.6 * purple)
c0 = np.array([0x07, 0x09, 0x0c]) / 255
c1 = np.array([0x48, 0x54, 0x61]) / 255
c2 = np.array([0xe8, 0xee, 0xf4]) / 255
t = l[..., None]
duo = np.where(t < 0.5, c0 + (c1 - c0) * (t / 0.5), c1 + (c2 - c1) * ((t - 0.5) / 0.5))
# The rim: the strip of the subject that faces the light.
dx = int(w * 0.035) * (1 if side == 'right' else -1)
shifted = np.roll(subject, -dx, axis=1)
rim = np.clip(subject - shifted, 0, 1)
rim_img = Image.fromarray((rim * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(w * 0.012))
rim = np.asarray(rim_img).astype(np.float32) / 255
rim = np.clip(rim * 1.8, 0, 1) * subject * np.clip(0.35 + l * 1.4, 0, 1)
red = np.array([0xff, 0x3b, 0x4a]) / 255
x = np.linspace(0, 1, w)[None, :]
if side == 'left':
    x = 1 - x
sidelight = np.clip((x - 0.5) / 0.5, 0, 1) ** 1.5
# Lit side of the face and hair: a light red tint in the highlights.
tint = (sidelight * subject * np.clip(l - 0.35, 0, 1) * 0.5)
g = np.clip(rim * 0.95 + tint, 0, 0.95)[..., None]
lit = red * np.clip(0.45 + 0.9 * t, 0, 1.2)
outa = duo * (1 - g) + np.clip(lit, 0, 1) * g
haze = (sidelight * purple * 0.28)[..., None]
outa = outa * (1 - haze) + red * 0.42 * haze
yy, xx = np.mgrid[0:h, 0:w]
d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h * 0.45) / (h / 2)) ** 2)
vig = np.clip(1 - (d - 0.75) * 0.6, 0.55, 1)[..., None]
scan = (1 - 0.05 * ((yy // 2) % 2))[..., None]
outa = np.clip(outa * vig * scan, 0, 1)
Image.fromarray((outa * 255).astype(np.uint8)).save(out)
