#!/usr/bin/env bash
# Encodes rendered frames + the mix into the delivery file.
#   tools/encode.sh [frames_dir] [fps] [out.mp4]
# AUDIO and TITLE override the soundtrack and the title metadata.
# H.264 High, 1920×1080, BT.709 limited range, AAC 320k, faststart.
set -euo pipefail
cd "$(dirname "$0")/.."
FRAMES=${1:-build/frames}
FPS=${2:-60}
OUT=${3:-build/disband-commercial-16x9-1080p.mp4}
FFMPEG=${FFMPEG:-ffmpeg}
AUDIO=${AUDIO:-build/audio/mix.wav}
TITLE=${TITLE:-Disband — Privacy first, privacy always.}

"$FFMPEG" -y -hide_banner -loglevel warning -nostats \
  -framerate "$FPS" -i "$FRAMES/f%05d.png" \
  -i "$AUDIO" \
  -map 0:v -map 1:a \
  -vf "scale=in_range=full:out_range=tv:out_color_matrix=bt709:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p" \
  -c:v libx264 -preset slow -crf 14 -profile:v high -level 4.2 -tune film \
  -x264-params "keyint=${FPS}:min-keyint=${FPS}:aq-mode=3" \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -c:a aac -b:a 320k -ar 48000 \
  -shortest -movflags +faststart \
  -metadata title="$TITLE" \
  -metadata copyright="© 2026 Genysis IQ. All rights reserved." \
  "$OUT"
echo "wrote $OUT"
