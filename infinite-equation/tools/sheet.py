import sys, glob
from PIL import Image, ImageDraw
files = sorted(glob.glob(sys.argv[1] + '/*.png'), key=lambda f: float(f.split('_')[-1][:-4]))
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 5
ims = [Image.open(f) for f in files]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * h), (40, 40, 40))
d = ImageDraw.Draw(S)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * w, (i // cols) * h
    S.paste(im, (x, y)); d.text((x + 6, y + 6), f.split('_')[-1][:-4], fill=(255, 80, 80))
S.save(sys.argv[2])
