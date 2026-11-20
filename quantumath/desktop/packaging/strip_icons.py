#!/usr/bin/env python3
"""Remove unreferenced Material icon classes from a fat jar.

Icons live in androidx/compose/material/icons/<style>/<Name>Kt.class and are independent of each other.
Every other class in the jar (app + libraries) is scanned for references to icon classes; icons that are
never referenced are dropped. Typically shrinks the jar by ~80 MB uncompressed.
"""
import re, sys, zipfile

src, dst = sys.argv[1], sys.argv[2]
ICON = re.compile(rb'androidx/compose/material/icons/(?:filled|outlined|rounded|sharp|twotone|automirrored/(?:filled|outlined|rounded|sharp|twotone))/[A-Za-z0-9_$]+')
is_icon = re.compile(r'^androidx/compose/material/icons/(?:filled|outlined|rounded|sharp|twotone|automirrored/(?:filled|outlined|rounded|sharp|twotone))/[^/]+\.class$')

with zipfile.ZipFile(src) as zin:
    names = zin.namelist()
    used = set()
    for n in names:
        if n.endswith('.class') and not is_icon.match(n):
            for m in ICON.findall(zin.read(n)):
                used.add(m.decode())
    kept = dropped = 0
    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_STORED) as zout:
        for info in zin.infolist():
            n = info.filename
            if is_icon.match(n):
                base = n[:-6].split('$')[0]
                if base not in used:
                    dropped += 1
                    continue
            data = zin.read(n)
            # keep native libraries/resources stored as-is
            # stored (uncompressed): the installer's solid LZMA compresses raw classes far better than deflate
            zout.writestr(info, data, compress_type=zipfile.ZIP_STORED)
            kept += 1
print(f"icons referenced: {len(used)}, entries kept: {kept}, icon classes dropped: {dropped}")
