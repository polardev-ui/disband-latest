"""Assemble rendered frames into a 60 fps APNG.

Usage:
    python3 make_apng.py <frames dir> <out.png>

Pillow stores delays in whole milliseconds, so frames alternate 17/17/16 ms: every three
frames last exactly 50 ms (60 fps on average, and loops whose length is a multiple of
three frames run exactly to time). Only the changed region of each frame is stored.
"""

import glob
import os
import sys

from PIL import Image

frames_dir, out = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(os.path.join(frames_dir, "f*.png")))
frames = [Image.open(f).convert("RGBA") for f in files]
durations = [16 if k % 3 == 2 else 17 for k in range(len(frames))]
frames[0].save(
    out,
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    disposal=0,  # keep the previous frame; each frame replaces only what changed
    blend=0,  # source: replace pixels (including transparency) in the changed region
    optimize=True,
)
