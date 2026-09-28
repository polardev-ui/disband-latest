#!/usr/bin/env python3
"""Traces the Disband mark to assets/logo/disband-mark.svg.

Source is the iOS app-icon glyph (1024 px). It is upsampled 3x and lightly
blurred so potrace fits curves to the anti-aliased edge rather than the pixel
grid; at 1024 px the traced outline stays within about 1 px of the original
(IoU 0.99), so the mark's proportions are unchanged. The viewBox is cropped to
the mark's own bounds so layouts can size it directly.
"""
import os
import re
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "..", "..", "ios", "DisbandiOS", "Resources", "AppIcon.icon", "Assets", "glyph.png")
OUT = os.path.join(ROOT, "assets", "logo", "disband-mark.svg")
SCALE = 3

alpha = Image.open(SRC).convert("RGBA").split()[3]
big = alpha.resize((alpha.width * SCALE, alpha.height * SCALE), Image.BICUBIC).filter(ImageFilter.GaussianBlur(4))
# potrace traces dark shapes, so the mark goes black on white.
with tempfile.TemporaryDirectory() as tmp:
    src_png = os.path.join(tmp, "mark.png")
    raw_svg = os.path.join(tmp, "mark.svg")
    big.point(lambda v: 0 if v > 127 else 255).convert("L").save(src_png)
    subprocess.run(["node", os.path.join(ROOT, "tools", "trace-logo.cjs"), src_png, raw_svg], check=True)
    d = " ".join(re.findall(r'd="([^"]+)"', open(raw_svg).read()))

mask = np.array(alpha) > 127
ys, xs = np.where(mask)
x0, y0 = xs.min() * SCALE, ys.min() * SCALE
w, h = (xs.max() + 1) * SCALE - x0, (ys.max() + 1) * SCALE - y0
with open(OUT, "w") as f:
    f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {w} {h}" width="{w / SCALE:.0f}" height="{h / SCALE:.0f}">'
            f'<path fill="currentColor" fill-rule="evenodd" d="{d}"/></svg>')
print(f"wrote {OUT} (viewBox {x0} {y0} {w} {h})")
