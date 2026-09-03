"""
Hero image for the launch email: three real app screens fanned out.

Separate from the App Store panels because email needs one wide, transparent-
free image sized for a 600px template — 880x760 at 2x for retina.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from importlib.machinery import SourceFileLoader
mod = SourceFileLoader("shots", str(Path(__file__).resolve().parent / "build-appstore-shots.py")).load_module()
import device as device_mod

W, H = 880, 720
SRC = Path(__file__).resolve().parent / "source-captures"
OUT = Path(__file__).resolve().parent.parent / "public" / "marketing"


def phone(name, width):
    """Shared device renderer, so the email and the App Store panels show the
    same hardware rather than two different mockups."""
    shot = Image.open(SRC / name).convert("RGB")
    h = round(shot.height * width / shot.width)
    shot = shot.resize((width, h), Image.LANCZOS)
    scale = width / 840
    return device_mod.render(
        shot,
        rail=max(4, round(11 * scale * 2)),
        bezel=max(3, round(9 * scale * 2)),
        buttons=width > 240,
    )


def shadow_for(img, blur, alpha):
    sil = Image.new("RGBA", img.size, (0, 0, 0, alpha))
    sil.putalpha(img.split()[3].point(lambda v: int(v * alpha / 255)))
    return sil.filter(ImageFilter.GaussianBlur(blur))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    base = mod.vgradient((W, H), (18, 20, 27), (12, 13, 18)).convert("RGBA")
    tint, mask = mod.radial_glow((W, H), (W // 2, int(H * 0.42)), int(W * 1.0),
                                 (88, 101, 242), 0.7)
    base = Image.composite(tint.convert("RGBA"), base, mask.point(lambda v: int(v * 0.30)))

    # Deliberately screens that never render the signed-in user's avatar. The
    # demo account is "Apple Review" with Apple's logo as its avatar, so any
    # chat or profile view drags Apple's trademark into our marketing.
    left = phone("05-notes.png", 250)
    right = phone("06-appearance.png", 250)
    centre = phone("01-servers.png", 310)

    # Side phones sit lower and behind, so the centre one reads as nearest.
    placements = [
        (left, (W // 2 - 350, 150), 0.55),
        (right, (W // 2 + 100, 150), 0.55),
        (centre, (W // 2 - centre.size[0] // 2, 60), 1.0),
    ]

    for img, pos, opacity in placements:
        layer = img
        if opacity < 1.0:
            layer = img.copy()
            layer.putalpha(layer.split()[3].point(lambda v: int(v * opacity)))
        sh = Image.new("RGBA", base.size, (0, 0, 0, 0))
        sh.alpha_composite(shadow_for(layer, 26, 190), (pos[0] + 4, pos[1] + 22))
        base = Image.alpha_composite(base, sh)
        base.alpha_composite(layer, pos)

    out = OUT / "hero-phone.png"
    base.convert("RGB").save(out, "PNG", optimize=True)
    print(f"  {out}  {base.size[0]}x{base.size[1]}")


if __name__ == "__main__":
    main()
