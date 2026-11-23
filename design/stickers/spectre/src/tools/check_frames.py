"""Loop and frame-rate checks on rendered sticker frames.

Usage:
    python3 check_frames.py <frames dir> [<frames dir> ...]

Each directory holds every frame of one sticker (f0000.png ... f{N-1}.png) rendered
with transparency. For each sticker it reports:
  - motion per frame: mean absolute RGBA change between consecutive frames
  - static frames: consecutive pairs with no visible change (held frames)
  - seam: the change from the last frame back to the first, compared with the
    typical change elsewhere (a seamless loop has a seam no bigger than its neighbours)
"""

import glob
import json
import os
import sys

import numpy as np
from PIL import Image


def load(path):
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32) / 255.0
    rgb = a[..., :3] * a[..., 3:4]  # premultiply so transparent pixels compare equal
    return np.concatenate([rgb, a[..., 3:4]], axis=-1)


def check(d):
    files = sorted(glob.glob(os.path.join(d, "f*.png")))
    frames = [load(f) for f in files]
    n = len(frames)
    diffs = [float(np.abs(frames[(k + 1) % n] - frames[k]).mean()) for k in range(n)]
    within = np.array(diffs[:-1])
    seam = diffs[-1]
    nbrs = [diffs[-3], diffs[-2], diffs[0], diffs[1]]
    static = int((within < 1e-5).sum())
    return {
        "sticker": os.path.basename(os.path.normpath(d)),
        "frames": n,
        "changingFrames": n - static,
        "heldFramePairs": static,
        "medianMotion": float(np.median(within)),
        "maxMotion": float(within.max()),
        "seam": seam,
        "seamVsNeighbours": seam / max(1e-9, float(np.mean(nbrs))),
        "seamVsMax": seam / max(1e-9, float(within.max())),
    }


if __name__ == "__main__":
    reports = [check(d) for d in sys.argv[1:]]
    print(json.dumps(reports, indent=2))
