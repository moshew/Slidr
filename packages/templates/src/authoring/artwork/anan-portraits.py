# The portraits of Anan's team slide: the gan-team set, cooled to navy and pale sky with a
# share of the original colour kept for the skin, and the studio wall turned to a soft sky.
#   python3 anan-portraits.py <src-dir> <out-dir>
import sys
from PIL import Image, ImageOps, ImageFilter, ImageChops

src, out = sys.argv[1:3]
NAVY, PALE = (12, 26, 51), (242, 248, 255)
TOP, BOTTOM = (205, 226, 250), (238, 245, 254)

def sky(size):
    w, h = size
    g = Image.new('RGB', (1, h))
    for y in range(h):
        t = y / (h - 1)
        g.putpixel((0, y), tuple(round(TOP[i] * (1 - t) + BOTTOM[i] * t) for i in range(3)))
    return g.resize((w, h))

for i in range(1, 5):
    im = Image.open(f'{src}/gan-team-{i}.webp').convert('RGB')
    grey = ImageOps.autocontrast(ImageOps.grayscale(im), cutoff=1)
    toned = Image.blend(ImageOps.colorize(grey, NAVY, PALE), im, 0.3)
    # The wall: bright and nearly colourless; a soft mask of it takes the sky.
    hsv = im.convert('HSV')
    sat = hsv.getchannel('S').point(lambda s: 255 if s < 40 else 0)
    bright = ImageOps.grayscale(im).point(lambda v: 255 if v > 205 else 0)
    wall = ImageChops.multiply(sat, bright).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(6))
    toned = Image.composite(Image.blend(toned, sky(im.size), 0.85), toned, wall)
    toned.save(f'{out}/anan-team-{i}.png')
