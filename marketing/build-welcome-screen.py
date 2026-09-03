"""
Welcome screen mockup at iPhone 15 Pro resolution (1179x2556 = 393x852 @3x).

Drawn rather than captured, so it can be used as a marketing screen before the
equivalent view exists in the app. Matches the app's palette and the status bar
the app's palette. No system chrome is drawn — a hand-illustrated status
bar and battery read as fake, and Apple discourages fabricated device UI.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1179, 2556                       # iPhone 15 Pro, 3x
S = 3                                   # points -> pixels
OUT = Path(__file__).resolve().parent / "source-captures" / "00-welcome.png"
LOGO = Path(__file__).resolve().parent.parent / "public" / "logo.png"

BG = (14, 15, 19)
CARD = (26, 28, 34)
BRAND = (88, 101, 242)
TEXT = (255, 255, 255)
MUTED = (150, 157, 170)
FONT = "/System/Library/Fonts/SFNS.ttf"


def font(px, weight=700):
    """SFNS is a variable font whose axes are (Width, Optical Size, GRAD,
    Weight) in that order. `set_variation_by_axes` takes the whole vector, so
    passing the weight alone silently sets *Width* and leaves every string at
    regular weight."""
    f = ImageFont.truetype(FONT, px)
    f.set_variation_by_axes([100, min(96, max(17, px / S)), 400, weight])
    return f


def centred(d, y, text, fnt, fill):
    w = d.textlength(text, font=fnt)
    d.text(((W - w) / 2, y), text, font=fnt, fill=fill)



def main():
    img = Image.new("RGB", (W, H), BG)

    # Brand glow behind the mark, so the screen isn't a flat rectangle.
    glow = Image.new("L", (W // 4, H // 4), 0)
    gd = ImageDraw.Draw(glow)
    cx, cy, r = W // 8, int(H * 0.30) // 4, W // 5
    for i in range(26, 0, -1):
        rr = r * i / 26
        gd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=int(150 * (1 - i / 26) ** 1.7))
    glow = glow.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(70))
    img = Image.composite(Image.new("RGB", (W, H), BRAND), img,
                          glow.point(lambda v: int(v * 0.30)))

    d = ImageDraw.Draw(img)

    # --- logo -------------------------------------------------------------
    mark = Image.open(LOGO).convert("RGBA")
    size = 132 * S
    mark = mark.resize((size, size), Image.LANCZOS)
    tile = 168 * S
    tx, ty = (W - tile) // 2, int(H * 0.215)
    d.rounded_rectangle([tx, ty, tx + tile, ty + tile], radius=42 * S,
                        fill=CARD, outline=(48, 52, 62), width=int(1.5 * S))
    img.paste(mark, (tx + (tile - size) // 2, ty + (tile - size) // 2), mark)

    # --- wordmark + subtext ------------------------------------------------
    y = ty + tile + 62 * S
    centred(d, y, "Disband", font(52 * S, 800), TEXT)
    y += 76 * S
    for line in ("Chat, voice and communities —", "on every device you own."):
        centred(d, y, line, font(19 * S, 400), MUTED)
        y += 30 * S

    # --- buttons ----------------------------------------------------------
    bw, bh = W - 96 * S, 58 * S
    bx = 48 * S
    by = H - 190 * S

    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=bh / 2, fill=BRAND)
    f = font(19 * S, 700)
    t = "Create an account"
    d.text(((W - d.textlength(t, font=f)) / 2, by + (bh - 24 * S) / 2), t, font=f, fill=TEXT)

    by2 = by + bh + 16 * S
    d.rounded_rectangle([bx, by2, bx + bw, by2 + bh], radius=bh / 2,
                        fill=CARD, outline=(56, 60, 72), width=int(1.5 * S))
    t = "Sign In"
    d.text(((W - d.textlength(t, font=f)) / 2, by2 + (bh - 24 * S) / 2), t, font=f, fill=TEXT)


    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"  {OUT}  {W}x{H}")


if __name__ == "__main__":
    main()
