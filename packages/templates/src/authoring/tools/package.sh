#!/bin/bash
# Builds the package for the media library: the delta (catalog fragments and pictures), the merge
# script, its README, and the sources; then zips it.
#   tools/package.sh <out-dir>        e.g. tools/package.sh /tmp/slidr-tech
set -euo pipefail
OUT=${1:?out dir}
HERE=$(cd "$(dirname "$0")/.." && pwd)            # packages/templates/src/authoring
TOOLS=$HERE/tools
rm -rf "$OUT" && mkdir -p "$OUT"
(cd "$HERE/../.." && node "$TOOLS/run-ts.mjs" src/authoring/catalog.ts "$OUT")
cp "$TOOLS/merge-into-library.mjs" "$OUT/"
cp "$TOOLS/README-delta.md" "$OUT/README.md"
mkdir -p "$OUT/source"
# What git holds of this folder, but the pictures: they are in images/ already.
(cd "$HERE" && git ls-files -- . ':!:pictures/*.webp' ':!:pictures/designs/*.webp' |
  while read -r file; do
    mkdir -p "$OUT/source/$(dirname "$file")" && cp "$file" "$OUT/source/$file"
  done)
(cd "$(dirname "$OUT")" && rm -f "$(basename "$OUT").zip" && zip -qr "$(basename "$OUT").zip" "$(basename "$OUT")")
echo "packaged: $OUT.zip ($(du -h "$OUT.zip" | cut -f1))"
