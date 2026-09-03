"""
Builds App Store screenshots at the 6.9" iPhone size (1320x2868).

Real captures from the running app are composited into a dimensional frame —
perspective tilt, contact shadow, rim light, depth-of-field gradient — rather
than mocked up, because Guideline 2.3.3 requires screenshots to show the app
actually in use.

    python3 marketing/build-appstore-shots.py
"""
from __future__ import annotations

import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import device as device_mod

W, H = 1320, 2868                      # App Store 6.9" portrait
SRC = Path(__file__).resolve().parent / "source-captures"
OUT = Path(__file__).resolve().parent / "appstore"

BOLD = "/System/Library/Fonts/SFNS.ttf"
REG = "/System/Library/Fonts/SFNS.ttf"

BRAND = (88, 101, 242)
ACCENT = (235, 69, 158)


def font(size: int, weight: int = 700) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(BOLD, size)
    # SFNS axes are (Width, Optical Size, GRAD, Weight); passing one value sets
    # Width, which stretched every headline and left it at regular weight.
    f.set_variation_by_axes([100, min(96, max(17, size / 3)), 400, weight])
    return f


def vgradient(size, top, bottom):
    """Vertical gradient, built one row at a time then resized — far cheaper
    than per-pixel work at this canvas size."""
    w, h = size
    strip = Image.new("RGB", (1, h))
    px = strip.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return strip.resize((w, h), Image.BICUBIC)


def radial_glow(size, centre, radius, colour, strength=1.0):
    """Soft coloured light, drawn small and upscaled so the falloff stays smooth."""
    w, h = size
    small = max(2, radius // 6)
    layer = Image.new("L", (w // 6, h // 6), 0)
    d = ImageDraw.Draw(layer)
    cx, cy = centre[0] // 6, centre[1] // 6
    r = radius // 6
    steps = 28
    for i in range(steps, 0, -1):
        rr = r * i / steps
        val = int(255 * strength * (1 - i / steps) ** 1.7)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=val)
    layer = layer.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(40))
    tint = Image.new("RGB", (w, h), colour)
    return tint, layer


def rounded(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1],
                                           radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def perspective_coeffs(src, dst):
    """Coefficients mapping dst -> src, which is the direction PIL samples."""
    matrix = []
    for (sx, sy), (dx, dy) in zip(src, dst):
        matrix.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        matrix.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
    import numpy as np
    A = np.array(matrix, dtype=float)
    B = np.array(src, dtype=float).reshape(8)
    return np.linalg.solve(A, B).reshape(8)


def tilt(img: Image.Image, amount: float):
    """Rotate the phone slightly in 3D: the far edge is shortened and inset,
    which reads as depth without an actual 3D renderer.

    Every destination corner stays inside the output canvas. The previous
    version placed the far edge at `x = w * amount`, which is negative for a
    right-leaning tilt, so that whole side of the phone fell outside the image
    and the body was sliced off flat down its left edge.
    """
    w, h = img.size
    shift = abs(amount) * w
    squeeze = abs(amount) * h * 0.30
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    if amount >= 0:
        # Far edge on the left: inset and vertically shortened.
        dst = [(shift, squeeze), (w, 0), (w, h), (shift, h - squeeze)]
    else:
        dst = [(0, 0), (w - shift, squeeze), (w - shift, h - squeeze), (0, h)]
    coeffs = perspective_coeffs(src, dst)
    return img.transform((w, h), Image.PERSPECTIVE, coeffs, Image.BICUBIC)


def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for word in words:
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


PANELS = [
    dict(shot="01-servers.png",  eyebrow="COMMUNITIES",
         title="Every community,\none app",
         sub="Servers, channels and roles — organised the way your group actually talks.",
         hue=(88, 101, 242), tilt=0.052),
    dict(shot="02-channels.png", eyebrow="CHANNELS",
         title="A channel for\neverything",
         sub="Text and voice, grouped into categories you control.",
         hue=(124, 92, 240), tilt=-0.052),
    dict(shot="03-chat.png",     eyebrow="MESSAGING",
         title="Conversations\nthat keep up",
         sub="Replies, reactions, edits and attachments — delivered instantly.",
         hue=(45, 160, 200), tilt=0.052),
    dict(shot="04-messages.png", eyebrow="DIRECT MESSAGES",
         title="Talk one on one,\nor as a group",
         sub="Private DMs and group chats, always in sync across your devices.",
         hue=(235, 69, 158), tilt=-0.052),
    dict(shot="05-notes.png",    eyebrow="NOTES",
         title="A private space\njust for you",
         sub="Keep thoughts, links and images somewhere only you can reach.",
         hue=(60, 170, 120), tilt=0.052),
    # Deliberately the Appearance screen rather than the profile: the demo
    # account's avatar and banner are Apple's logo, and shipping Apple's
    # trademark inside our own App Store marketing invites a rejection.
    dict(shot="06-appearance.png", eyebrow="PERSONALISE",
         title="Make it\nunmistakably yours",
         sub="Eight themes that follow your account to every device you sign in on.",
         hue=(240, 145, 63), tilt=-0.052),
]


def build(panel, index):
    hue = panel["hue"]

    # --- background: deep base, coloured light, vignette -------------------
    base = vgradient((W, H), (16, 17, 22), (7, 8, 11)).convert("RGB")
    tint, mask = radial_glow((W, H), (int(W * 0.5), int(H * 0.30)), int(W * 1.15), hue, 0.55)
    base = Image.composite(tint, base, mask.point(lambda v: int(v * 0.42)))
    tint2, mask2 = radial_glow((W, H), (int(W * 0.1), int(H * 0.9)), int(W * 0.9), ACCENT, 0.4)
    base = Image.composite(tint2, base, mask2.point(lambda v: int(v * 0.16)))

    canvas = base.convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    # --- type -------------------------------------------------------------
    m = 96
    y = 168

    f_eye = font(38, 800)
    draw.text((m, y), panel["eyebrow"], font=f_eye, fill=hue + (255,))
    y += 74

    # Shrink the headline until the longest line clears the margin, rather than
    # hand-tuning copy per panel. "unmistakably yours" ran to within 35px of the
    # edge at the nominal size.
    lines = panel["title"].split("\n")
    size = 104
    while size > 68:
        f_title = font(size, 800)
        if max(draw.textlength(l, font=f_title) for l in lines) <= W - m * 2:
            break
        size -= 4
    f_title = font(size, 800)
    for line in lines:
        draw.text((m, y), line, font=f_title, fill=(255, 255, 255, 255))
        y += int(size * 1.135)
    y += 18

    f_sub = font(40, 500)
    for line in wrap(draw, panel["sub"], f_sub, W - m * 2 - 40):
        draw.text((m, y), line, font=f_sub, fill=(176, 182, 196, 255))
        y += 54

    # --- device -----------------------------------------------------------
    shot = Image.open(SRC / panel["shot"]).convert("RGB")

    # Fit to whatever vertical room the copy left, so a longer headline shrinks
    # the device rather than pushing it off the canvas.
    top = y + 92
    # Leave real breathing room below: the device was running off the canvas.
    avail_h = H - top - 112
    rail, bezel = 5, 4
    target_w = int(W * 0.74)
    target_h = round(shot.height * target_w / shot.width)
    if target_h + (rail + bezel) * 2 > avail_h:
        target_h = avail_h - (rail + bezel) * 2
        target_w = round(shot.width * target_h / shot.height)
    shot = shot.resize((target_w, target_h), Image.LANCZOS)

    frame = device_mod.render(shot, rail=rail, bezel=bezel)
    tilted = tilt(frame, panel["tilt"])

    dx = (W - tilted.size[0]) // 2
    dy = top

    canvas = Image.alpha_composite(canvas, device_mod.drop_shadow(tilted, canvas.size, (dx, dy)))

    # Rim light behind the device picks the panel hue back up.
    rim_t, rim_m = radial_glow((W, H), (W // 2, dy + tilted.size[1] // 2),
                               int(W * 0.85), hue, 0.9)
    canvas = Image.composite(rim_t.convert("RGBA"), canvas,
                             rim_m.point(lambda v: int(v * 0.20)))

    canvas.alpha_composite(tilted, (dx, dy))

    out = OUT / f"{index:02d}-{panel['shot'].split('-', 1)[1]}"
    canvas.convert("RGB").save(out, "PNG", optimize=True)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for i, panel in enumerate(PANELS, start=1):
        path = build(panel, i)
        print(f"  {path.name}")


if __name__ == "__main__":
    main()
