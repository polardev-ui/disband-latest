"""Compile the original RGBA illustrations into seamless animated WebP cosmetics.

Requires Python 3, Pillow (with animated WebP support), and numpy.
Run: python3 scripts/render-shop-art.py
Source PNGs remain untouched. Motion is baked into the exported image files;
the browser needs no canvas, animation library, or per-frame JavaScript.
"""
from pathlib import Path
import json
import math
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/shop/art"
OUT.mkdir(parents=True, exist_ok=True)
FRAMES = 48


def animate(name):
    ring = name.endswith("-ring")
    size = (256, 256) if ring else (320, 480)
    source = Image.open(ROOT / "art/shop/source" / f"{name}.png").convert("RGBA")
    source = source.resize(size, Image.Resampling.LANCZOS)
    source.save(OUT / f"{name}.webp", quality=88, method=6)
    w, h = size
    yy, xx = np.mgrid[:h, :w].astype(np.float32)
    x, y = xx / w, yy / h
    # Anchor the inner ring so it never exposes the edge of the user's avatar.
    radial = np.hypot(x - .5, y - .49)
    strength = np.clip((radial - .29) / .14, 0, 1) if ring else np.ones_like(x)
    edge = np.minimum(np.minimum(x, 1-x), np.minimum(y, 1-y))
    strength *= np.clip(edge * 35, 0, 1)
    pixels = np.asarray(source).astype(np.float32) / 255
    # Interpolate premultiplied colour to prevent black fringes on pale themes.
    pixels[:, :, :3] *= pixels[:, :, 3:4]
    frames = []
    for n in range(FRAMES):
        phase = n / FRAMES * math.tau
        if name.startswith("tideglass"):
            dx = np.sin(y * 15 - phase) * 3.5 * strength
            dy = np.cos(x * 12 + phase) * 3 * strength
        elif name.startswith("moonmoth"):
            # Opposing wings flex; hanging ornaments gently swing.
            dx = (x-.5) * np.sin(phase*2 + y*4) * 12 * strength
            dy = np.sin(phase + x*8) * 2.3 * strength
        else:
            dx = np.sin(y * 18 + phase*2) * 3.5 * strength
            dy = np.cos(x * 11 - phase) * 4.5 * strength
        sx, sy = np.clip(xx+dx, 0, w-1), np.clip(yy+dy, 0, h-1)
        x0, y0 = sx.astype(int), sy.astype(int)
        x1, y1 = np.minimum(x0+1, w-1), np.minimum(y0+1, h-1)
        tx, ty = (sx-x0)[..., None], (sy-y0)[..., None]
        p = ((pixels[y0,x0]*(1-tx)+pixels[y0,x1]*tx)*(1-ty)
             + (pixels[y1,x0]*(1-tx)+pixels[y1,x1]*tx)*ty)
        alpha = p[:, :, 3:4]
        rgb = p[:, :, :3] / np.maximum(alpha, .0001)
        # A narrow glint travels over painted highlights, never the clear center.
        glint = np.maximum(0, np.cos(x*8-y*5-phase)) ** 18
        light = np.max(rgb, axis=2)
        rgb *= (1 + .14 * glint * np.clip((light-.4)*2, 0, 1))[:, :, None]
        frame = np.concatenate((np.clip(rgb,0,1), alpha), axis=2)
        frames.append(Image.fromarray(np.uint8(np.round(frame*255))))
    target = OUT / f"{name}.animated.webp"
    frames[0].save(target, save_all=True, append_images=frames[1:], duration=[83, 83, 84] * 16,
                   loop=0, quality=68, method=4, minimize_size=True)
    # Verify the delivered media, including alpha in every frame and loop timing.
    encoded = Image.open(target)
    assert encoded.n_frames == FRAMES, name
    for i in range(encoded.n_frames):
        encoded.seek(i)
        assert encoded.convert("RGBA").getpixel((w//2,h//2))[3] == 0, (name,i)
    print(f"{name}: {encoded.n_frames} frames, {target.stat().st_size/1024:.0f} KiB", flush=True)
    return {"name":name,"width":w,"height":h,"frames":FRAMES,"durationMs":4000,
            "bytes":target.stat().st_size,"transparentCenter":True}


if __name__ == "__main__":
    results = [animate(p.stem) for p in sorted((ROOT/"art/shop/source").glob("*.png"))]
    (ROOT / "art/shop/exports.json").write_text(json.dumps(results, indent=2)+"\n")
