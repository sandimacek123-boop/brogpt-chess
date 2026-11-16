#!/usr/bin/env bash
# Full production render: audio -> video (parallel chunks) -> final MP4 + preview.
set -euo pipefail
cd "$(dirname "$0")/.."
JOBS=${JOBS:-2}
python3 audio/make_audio.py
mkdir -p build/chunks
rm -f build/chunks/*.mp4 build/chunks/list.txt
N=900; STEP=$(( (N + JOBS - 1) / JOBS ))
pids=()
for ((j=0; j<JOBS; j++)); do
  s=$((j*STEP)); e=$(( s+STEP < N ? s+STEP : N ))
  node render.js --start $s --end $e --out build/chunks/c$j.mp4 > build/chunks/log$j.txt 2>&1 &
  pids+=($!)
  echo "file 'c$j.mp4'" >> build/chunks/list.txt
done
for p in "${pids[@]}"; do wait $p; done
ffmpeg -y -loglevel error -f concat -safe 0 -i build/chunks/list.txt -c copy build/video.mp4
./tools/finalize.sh
