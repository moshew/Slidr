#!/bin/bash
# Renders the pictures of the five defence designs (designs/defence.ts) and puts them in
# pictures/designs: each page is rendered with render-art.mjs, products on a transparent ground
# are trimmed to their ink, then design-picture.py writes the .webp and its size.
#   bash defence-pictures.sh [id ...]
set -e
S=/tmp/claude-0/-home-user-Slidr/47879b34-d1cb-5c54-8cd5-146df1bb4f61/scratchpad
T=$S/tools
A=$(cd "$(dirname "$0")" && pwd)
OUT=$S/defence
mkdir -p "$OUT"
# render-art.mjs with longer timeouts, for a busy machine (the scenes take up to a minute)
R=$OUT/render-long.mjs
[ -f "$R" ] || R=$T/render-art.mjs
render() { # id w h scale trim
  node "$R" "$A/$1.html" "$OUT/$1.png" "$2" "$3" "$4"
  if [ "$5" = trim ]; then
    python3 -c "
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
box = im.getchannel('A').point(lambda a: 255 if a > 3 else 0).getbbox()
pad = 12
crop = (max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad))
print('trimmed to', crop)
im.crop(crop).save(sys.argv[1])
" "$OUT/$1.png"
  fi
  python3 "$T/design-picture.py" "$1" "$OUT/$1.png"
}
want() { local id=$1; shift; [ $# -eq 0 ] || [[ " $* " == *" $id "* ]]; }
ids=("$@")
want m-thermal "${ids[@]}" && render m-thermal 1920 1080 1.5
want m-antijam "${ids[@]}" && render m-antijam 900 1000 2 trim
want m-meshradio "${ids[@]}" && render m-meshradio 1200 900 2 trim
want m-cyberrange "${ids[@]}" && render m-cyberrange 1560 640 2
want m-simtraining "${ids[@]}" && render m-simtraining 1300 900 2 trim
exit 0
