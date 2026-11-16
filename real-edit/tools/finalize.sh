#!/usr/bin/env bash
# Mux rendered video + soundtrack into the deliverables.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p out
ffmpeg -y -loglevel error -i build/video.mp4 -i build/audio.wav \
  -map 0:v:0 -map 1:a:0 -c:v libx264 -preset slow -crf 17 -maxrate 30M -bufsize 60M -tune film \
  -profile:v high -level 4.2 -pix_fmt yuv420p -r 60 -g 60 -bf 2 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 320k -ar 48000 -ac 2 -frames:v 900 -t 15 -movflags +faststart \
  out/REAL_FINAL_EDIT.mp4
ffmpeg -y -loglevel error -i out/REAL_FINAL_EDIT.mp4 -vf scale=720:1280:flags=lanczos \
  -c:v libx264 -preset slow -crf 22 -profile:v high -level 4.1 -pix_fmt yuv420p -r 60 \
  -c:a aac -b:a 192k -movflags +faststart out/REAL_EDIT_PREVIEW.mp4
for f in out/REAL_FINAL_EDIT.mp4 out/REAL_EDIT_PREVIEW.mp4; do
  echo "== $f ($(du -h "$f" | cut -f1))"
  ffprobe -v error -show_entries stream=codec_name,profile,width,height,r_frame_rate,nb_frames,pix_fmt,sample_rate,channels:format=duration -of compact "$f"
done
