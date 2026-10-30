#!/usr/bin/env python3
"""Cuts the per-part assets of the library from the captures.

    python3 reconnect/extract.py
        reads  reconnect/library/captures/main.png, hover-rail.png, layout.json
        writes reconnect/library/crops/*.png  (3×, one file per interface part)
               reconnect/library/brand/       (the official mark, from the repos)
               reconnect/library/manifest.json

Every crop is cut at a rectangle measured from the live DOM, so the pieces
tile back into the exact interface.
"""
import json
import os
import shutil

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(HERE, "library")
CAP = os.path.join(LIB, "captures")
OUT = os.path.join(LIB, "crops")
BRAND = os.path.join(LIB, "brand")
CLASSIC = os.environ.get("CLASSIC_REPO", os.path.expanduser("~/Projects/disband-classic"))
os.makedirs(OUT, exist_ok=True)
os.makedirs(BRAND, exist_ok=True)

L = json.load(open(os.path.join(LIB, "layout.json")))
S = L["scale"]
main = Image.open(os.path.join(CAP, "main.png")).convert("RGBA")
hover = Image.open(os.path.join(CAP, "hover-rail.png")).convert("RGBA")
manifest = []


def cut(img, name, x, y, w, h, kind, note="", mask=None):
    im = img.crop((x * S, y * S, (x + w) * S, (y + h) * S))
    if mask == "circle" or mask == "squircle":
        m = Image.new("L", im.size, 0)
        r = im.size[0] // 2 if mask == "circle" else 16 * S
        ImageDraw.Draw(m).rounded_rectangle((0, 0, im.size[0] - 1, im.size[1] - 1), r, fill=255)
        im.putalpha(m)
    im.save(os.path.join(OUT, name))
    manifest.append({"file": f"crops/{name}", "kind": kind, "rect": {"x": x, "y": y, "w": w, "h": h}, "note": note})


# Rail: each space as a 48 px icon (circle at rest, rounded square when active).
for i, it in enumerate(L["rail"]):
    cut(main, f"rail-{i:02d}.png", it["x"], it["y"], 48, 48, "rail icon",
        it["label"], "squircle" if it["active"] else "circle")
night = next(i for i, it in enumerate(L["rail"]) if it["label"] == "Night Owls")
it = L["rail"][night]
cut(hover, "rail-hover-night-owls.png", 0, it["y"] - 4, 190, 56, "rail hover state", "Night Owls hovered: pill and tooltip")
for i, sep in enumerate(L["railSeparators"]):
    cut(main, f"rail-separator-{i}.png", sep["x"], sep["y"], sep["w"], sep["h"], "rail separator")

# Channel column: header, rows, user panel.
cut(main, "channel-header.png", 72, 0, 240, 48, "channel column header", "space name")
for i, c in enumerate([c for c in L["channels"] if 48 <= c["y"] < 800]):
    cut(main, f"channel-{i:02d}.png", 72, c["y"], 240, c["h"], "channel row", c["text"])
cut(main, "user-panel.png", 72, 848, 240, 52, "user panel")

# Chat: header, message groups (cut at the authors' rows), composer.
cut(main, "chat-header.png", 312, 0, 888, 48, "chat header")
tops = [m["y"] for m in L["messages"] if m["y"] > 60]
edges = [48] + tops + [L["composer"]["y"] - 18]
for i in range(len(edges) - 1):
    cut(main, f"message-{i:02d}.png", 312, edges[i], 888, edges[i + 1] - edges[i], "message band")
cut(main, "composer.png", 312, L["composer"]["y"] - 18, 888, 900 - (L["composer"]["y"] - 18), "composer")

# Member list rows.
for i, m in enumerate(L["members"]):
    cut(main, f"member-{i:02d}.png", 1200, m["y"], 240, m["h"], "member row", m["name"])

# The official mark, as shipped in the repositories.
shutil.copy(os.path.join(HERE, "..", "assets", "logo", "disband-mark.svg"), os.path.join(BRAND, "disband-mark.svg"))
for f in ("logo-white.png", "logo.png"):
    src = os.path.join(CLASSIC, "public", f)
    if os.path.exists(src):
        shutil.copy(src, os.path.join(BRAND, f))

json.dump({"source": "disband-classic /dev/classic (fictional sample data)", "scale": S, "parts": manifest},
          open(os.path.join(LIB, "manifest.json"), "w"), indent=2)
print(f"{len(manifest)} crops -> {OUT}")
