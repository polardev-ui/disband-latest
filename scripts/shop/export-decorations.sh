#!/usr/bin/env bash
# Renders drawn avatar decorations to the 512 × 512 PNGs the iOS and Android
# apps lay over a profile photo (public/decorations/<id>.png): each one's
# still pose from the decoration lab's export view, on a transparent page.
#
#   scripts/shop/export-decorations.sh ring-moonlit-orbit ring-koi-current ...
#
# Needs the web app's dev server on $BASE (default http://localhost:3000)
# and Google Chrome.
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/decorations"
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT
for id in "$@"; do
  nice -n 10 "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" \
    --force-device-scale-factor=1 --window-size=512,512 --default-background-color=00000000 \
    --virtual-time-budget=8000 --screenshot="$OUT/$id.png" "$BASE/decorations-lab?export=$id" >/dev/null 2>&1
  echo "$OUT/$id.png"
done
