#!/usr/bin/env python3
"""QC on a rendered MP4: per-frame luminance curve, flash count (WCAG-style), frame strips around cuts.
usage: python3 tools/qc.py out/REAL_FINAL_EDIT.mp4 build/qcv"""
import sys, os, subprocess, json
import numpy as np
from PIL import Image, ImageDraw
src, outd = sys.argv[1], sys.argv[2]
os.makedirs(outd, exist_ok=True)
W, H = 135, 240
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).astype(np.float32) / 255
print('decoded frames:', len(fr))
lin = np.where(fr <= 0.04045, fr / 12.92, ((fr + 0.055) / 1.055) ** 2.4)
L = (lin @ np.array([0.2126, 0.7152, 0.0722])).mean(axis=(1, 2))
# flash = pair of opposing changes >= 10% relative luminance where darker state < 0.8 (WCAG 2.3.1 approximation)
d = np.diff(L)
events = [i for i in range(1, len(d)) if abs(d[i]) >= 0.1 and min(L[i], L[i + 1]) < 0.8]
worst = max((sum(1 for e in events if s <= e < s + 60) for s in range(len(L))), default=0)
print('large luminance transitions:', events)
print('max transitions in any 1 s window:', worst, '(flash pairs ~= half of that)')
blk = [i for i in range(len(L)) if fr[i].max() < 0.02]
print('near-black frames:', blk[:20], '...' if len(blk) > 20 else '')
# luminance plot
im = Image.new('RGB', (len(L) * 2, 300), (12, 12, 16)); dr = ImageDraw.Draw(im)
for i, v in enumerate(L): dr.line([(i * 2, 300), (i * 2, 300 - v * 290)], fill=(22, 139, 255))
for c in [102, 126, 270, 366, 558, 654, 750]: dr.line([(c * 2, 0), (c * 2, 300)], fill=(255, 60, 60))
im.save(os.path.join(outd, 'luma.png'))
# strips around transitions
def strip(name, frames):
    s = Image.new('RGB', (W * 2 * len(frames), H * 2 + 16), (40, 0, 40)); dd = ImageDraw.Draw(s)
    for k, f in enumerate(frames):
        s.paste(Image.fromarray((fr[f] * 255).astype(np.uint8)).resize((W * 2, H * 2)), (k * W * 2, 16)); dd.text((k * W * 2 + 3, 2), str(f), fill=(255, 255, 255))
    s.save(os.path.join(outd, name + '.png'))
strip('s_awaken', [0, 20, 45, 70, 90, 98, 101, 102, 103, 106, 112, 125])
strip('s_build', [126, 132, 150, 174, 180, 200, 222, 228, 240, 258, 264, 269])
strip('s_drop', [270, 271, 272, 274, 278, 284, 294, 318, 340, 352, 360, 365])
strip('s_exec', [366, 370, 376, 392, 412, 418, 440, 462, 470, 506, 512, 540, 552, 557])
strip('s_climax', [558, 560, 566, 600, 640, 653, 654, 655, 656, 660, 690, 710, 730, 740, 746, 749])
strip('s_final', [750, 751, 752, 755, 762, 775, 798, 810, 840, 860, 880, 899])
json.dump({'luma': [round(float(x), 4) for x in L]}, open(os.path.join(outd, 'luma.json'), 'w'))
