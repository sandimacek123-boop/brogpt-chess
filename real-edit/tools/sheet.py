#!/usr/bin/env python3
# contact sheet of QC frames: python3 tools/sheet.py build/qc out.png [cols]
import sys, glob, os
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
files = sorted(glob.glob(os.path.join(d, 'f*.png')))
tw, th = 270, 480
rows = (len(files) + cols - 1) // cols
sh = Image.new('RGB', (cols * tw, rows * (th + 18)), (40, 0, 40))
dr = ImageDraw.Draw(sh)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((tw, th), Image.LANCZOS)
    x, y = (i % cols) * tw, (i // cols) * (th + 18)
    sh.paste(im, (x, y + 18)); dr.text((x + 4, y + 3), os.path.basename(f), fill=(255, 255, 255))
sh.save(out)
