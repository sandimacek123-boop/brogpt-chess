#!/usr/bin/env bash
# Re-render only changed frame ranges and splice them into build/video.mp4 (deterministic renderer => identical untouched frames).
# usage: tools/splice.sh "0-126 270-558"
set -euo pipefail
cd "$(dirname "$0")/.."
RANGES=($1)
mkdir -p build/splice; rm -f build/splice/*
pids=(); k=0
for r in "${RANGES[@]}"; do s=${r%-*}; e=${r#*-}; node render.js --start $s --end $e --out build/splice/n$k.mp4 > build/splice/log$k.txt 2>&1 & pids+=($!); k=$((k+1)); done
for p in "${pids[@]}"; do wait $p; done
python3 - "${RANGES[@]}" <<'PY'
import sys, subprocess
rs = [tuple(map(int, r.split('-'))) for r in sys.argv[1:]]
segs, cur, k = [], 0, 0
inputs = ['-i', 'build/video.mp4']
for i, (s, e) in enumerate(rs):
    if s > cur: segs.append(('old', cur, s))
    segs.append(('new', i, s, e)); inputs += ['-i', f'build/splice/n{i}.mp4']; cur = e
if cur < 900: segs.append(('old', cur, 900))
fc, labels = [], []
for j, sg in enumerate(segs):
    if sg[0] == 'old': fc.append(f'[0:v]trim=start_frame={sg[1]}:end_frame={sg[2]},setpts=PTS-STARTPTS[s{j}]')
    else: fc.append(f'[{sg[1]+1}:v]setpts=PTS-STARTPTS[s{j}]')
    labels.append(f'[s{j}]')
fc.append(''.join(labels) + f'concat=n={len(segs)}:v=1:a=0[v]')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(fc), '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '10', '-pix_fmt', 'yuv420p', '-r', '60', 'build/video_spliced.mp4'], check=True)
PY
mv build/video_spliced.mp4 build/video.mp4
ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 build/video.mp4
./tools/finalize.sh
