# The founders of the Mutzar sample: the tzuk-team-1..4 portraits, each cut out and set on a soft
# tint of the colour of their cursor (coral, violet, mint, amber), with a warm grade.
#   1. Cut-outs: rembg 2.0 with the isnet-general-use model, written to <work>/cut/team-<n>-isnet-general-use.png
#   2. python3 mutzar-team.py   (set M to the work folder) -> <work>/team-<n>.png
#   3. python3 pictures.py mutzar-team-<n> <work>/team-<n>.png 86
import os
import numpy as np
from PIL import Image, ImageFilter

M = os.environ.get('M', '.')
TINTS = [  # light at the top, deeper at the foot: coral, violet, mint, amber
    ((255, 233, 224), (255, 196, 178)),
    ((236, 233, 255), (206, 198, 252)),
    ((226, 246, 237), (182, 228, 208)),
    ((255, 241, 220), (255, 214, 158)),
]
for i in range(1, 5):
    cut = Image.open(f'{M}/cut/team-{i}-isnet-general-use.png').convert('RGBA')
    a = np.asarray(cut).astype(np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3:]
    # Tighten the soft edge a little so no grey of the old backdrop shows.
    alpha = np.clip((alpha - 0.06) / 0.94, 0, 1) ** 1.15
    h, w = alpha.shape[:2]
    top, foot = (np.array(c, np.float32) / 255 for c in TINTS[i - 1])
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = (yy / h)[..., None]
    bg = top * (1 - t) + foot * t
    # A soft light from the upper start corner.
    d = np.sqrt(((xx - w * 0.75) / w) ** 2 + ((yy - h * 0.15) / h) ** 2)[..., None]
    bg = bg + (1 - bg) * np.clip(0.55 - d, 0, 1) * 0.9
    # Warm grade of the person: a touch of warmth, lifted shadows, gentle contrast.
    p = rgb.copy()
    p[..., 0] *= 1.035
    p[..., 2] *= 0.95
    p = 0.035 + p * 0.965
    p = np.clip(p, 0, 1) ** 0.96
    # Edge pixels take some of the new backdrop's colour.
    edge = np.clip(1 - alpha, 0, 1) * (alpha > 0.02)
    p = p * (1 - 0.5 * edge) + bg * 0.5 * edge
    # A soft shadow of the figure on the backdrop, down and to the end side.
    sh = Image.fromarray((alpha[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14))
    sh0 = np.asarray(sh).astype(np.float32) / 255
    sh = np.zeros_like(sh0)
    sh[8:, :-10] = sh0[:-8, 10:]
    sh = sh[..., None]
    bg = bg * (1 - 0.12 * sh)
    out = p * alpha + bg * (1 - alpha)
    Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(f'{M}/team-{i}.png')
    print(i)
