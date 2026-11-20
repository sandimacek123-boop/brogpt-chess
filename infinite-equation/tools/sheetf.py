import sys
from PIL import Image, ImageDraw
d, out, a, b, step, cols = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7])
idx = list(range(a, b + 1, step))
ims = [Image.open(f'{d}/f_{i:05d}.png') for i in idx]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * h), (40, 40, 40)); D = ImageDraw.Draw(S)
for k, (im, i) in enumerate(zip(ims, idx)):
    x, y = (k % cols) * w, (k // cols) * h
    S.paste(im, (x, y)); D.text((x + 4, y + 4), f'{i/60:.2f}', fill=(255, 80, 80))
S.save(out)
