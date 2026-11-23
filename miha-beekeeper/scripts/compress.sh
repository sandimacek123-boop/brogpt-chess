#!/usr/bin/env bash
# Two-pass x264 encode of the 4K master to ~95 MB (GitHub's file limit is 100 MB).
set -euo pipefail
cd "$(dirname "$0")/.."
IN=out/Miha_4k_master.mp4
OUT=out/Miha_Slovenian_Beekeeper.mp4
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
KBPS=$(python3 -c "print(int(95 * 8192 / $DUR - 192))")  # total budget minus 192 kbps audio
ffmpeg -y -v error -i "$IN" -c:v libx264 -preset slow -b:v ${KBPS}k -pass 1 -passlogfile out/x264 -an -f null /dev/null
ffmpeg -y -v error -i "$IN" -c:v libx264 -preset slow -b:v ${KBPS}k -pass 2 -passlogfile out/x264 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "$OUT"
rm -f out/x264*
ls -la "$OUT"
