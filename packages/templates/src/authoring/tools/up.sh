#!/bin/bash
# Serves a staged copy of the media library on port 8790 and the dev server on port 1420, which
# reads the library from it (SLIDR_MEDIA_URL). Each comes up only if it is not running already.
#   SITE=<folder written by tools/stage.mjs> tools/up.sh
set -u
SITE=${SITE:?set SITE to a folder staged by tools/stage.mjs}
APP=$(cd "$(dirname "$0")/../../../../../desktop" && pwd)
LOGS=${LOGS:-$SITE/..}
if ! curl -s -o /dev/null http://127.0.0.1:8790/manifest.json; then
  (cd "$SITE" && nohup python3 -m http.server 8790 --bind 127.0.0.1 > "$LOGS/site-server.log" 2>&1 &)
fi
if ! curl -s -o /dev/null http://localhost:1420/dev/review.html; then
  (cd "$APP" && SLIDR_MEDIA_URL=http://127.0.0.1:8790/ nohup npx vite --port 1420 > "$LOGS/vite.log" 2>&1 &)
fi
for _ in $(seq 1 30); do curl -s -o /dev/null http://localhost:1420/dev/review.html && break; sleep 1; done
curl -s -o /dev/null -w "library %{http_code}  " http://127.0.0.1:8790/manifest.json
curl -s -o /dev/null -w "dev server %{http_code}\n" http://localhost:1420/dev/review.html
