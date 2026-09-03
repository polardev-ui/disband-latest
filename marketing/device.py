"""
Realistic iPhone body renderer.

The previous mockup was a rounded rectangle with a flat outline, which reads as
a screenshot in a box. A real device has a machined rail that catches light
along its edges, a black bezel inset from that rail, buttons breaking the
silhouette, and a glass surface with a specular sweep. Those four things are
what sell it as hardware.

Everything renders at a supersampled scale and is downsampled once at the end,
so the rail highlights and button edges stay crisp instead of aliasing.
"""
from __future__ import annotations

from PIL import Image, ImageDraw, ImageFilter

SS = 3  # supersample factor

# iPhone 15 Pro: 393pt wide screen with a 55pt display corner radius, so the
# radius is 0.14 of the width. The body radius is only marginally larger,
# because the bezel and rail together are a couple of points — not the thick
# frame a naive mockup draws.


def _lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def _rail_gradient(w: int, h: int, base, edge):
    """Horizontal gradient across the metal rail.

    Titanium is brightest where the chamfer turns toward the viewer — near both
    outer edges — and darkest across the flat middle.
    """
    strip = Image.new("RGB", (w, 1))
    px = strip.load()
    for x in range(w):
        t = abs((x / max(1, w - 1)) - 0.5) * 2      # 0 centre → 1 edges
        px[x, 0] = _lerp(base, edge, t ** 1.6)
    return strip.resize((w, h), Image.BICUBIC)


def render(screen: Image.Image,
           corner: float = 0.137,
           rail: int = 5,
           bezel: int = 4,
           buttons: bool = True,
           glare: bool = True) -> Image.Image:
    """Wrap `screen` in a device body. Returns RGBA, larger than the input."""
    sw, sh = screen.size
    s_rail = rail * SS
    s_bez = bezel * SS
    pad = s_rail + s_bez

    sw_s, sh_s = sw * SS, sh * SS
    W, H = sw_s + pad * 2, sh_s + pad * 2
    r_screen = int(sw_s * corner)
    r_body = r_screen + pad

    body = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # --- machined rail -----------------------------------------------------
    rail_img = _rail_gradient(W, H, (206, 209, 216), (108, 112, 122)).convert("RGBA")
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, H - 1], radius=r_body, fill=255)
    rail_img.putalpha(mask)
    body.alpha_composite(rail_img)

    d = ImageDraw.Draw(body)

    # Thin bright chamfer just inside the silhouette catches the key light.
    d.rounded_rectangle([1, 1, W - 2, H - 2], radius=r_body,
                        outline=(238, 240, 245, 210), width=max(1, SS // 2))

    # --- black bezel between rail and glass --------------------------------
    d.rounded_rectangle([s_rail, s_rail, W - s_rail - 1, H - s_rail - 1],
                        radius=r_body - s_rail, fill=(9, 9, 11, 255))

    # --- the screen --------------------------------------------------------
    scr = screen.resize((sw_s, sh_s), Image.LANCZOS).convert("RGBA")
    m = Image.new("L", (sw_s, sh_s), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, sw_s - 1, sh_s - 1], radius=r_screen, fill=255)
    scr.putalpha(m)
    body.alpha_composite(scr, (pad, pad))

    # --- buttons break the silhouette --------------------------------------
    if buttons:
        btn_dark = (92, 96, 105, 255)
        btn_lit = (214, 217, 224, 255)
        bw = max(2, int(3.2 * SS))

        def side_button(y0, length, left):
            x0 = 0 if left else W - 1 - bw
            x1 = x0 + bw
            box = [x0, y0, x1, y0 + length]
            d.rounded_rectangle(box, radius=bw // 2, fill=btn_dark)
            # lit top edge, so it reads as a raised part rather than a notch
            d.rounded_rectangle([box[0], box[1], box[2], box[1] + max(1, SS)],
                                radius=bw // 2, fill=btn_lit)

        unit = H / 100
        side_button(int(unit * 17), int(unit * 5),  True)   # action button
        side_button(int(unit * 26), int(unit * 9),  True)   # volume up
        side_button(int(unit * 37), int(unit * 9),  True)   # volume down
        side_button(int(unit * 30), int(unit * 14), False)  # side button

    # --- glass ------------------------------------------------------------
    if glare:
        # A soft diagonal sweep across the upper-left, clipped to the glass.
        sweep = Image.new("L", (W, H), 0)
        sd = ImageDraw.Draw(sweep)
        sd.polygon([(-W * 0.1, 0), (W * 0.52, 0), (W * 0.04, H), (-W * 0.5, H)], fill=15)
        sd.polygon([(W * 0.60, 0), (W * 0.70, 0), (W * 0.22, H), (W * 0.12, H)], fill=8)
        sweep = sweep.filter(ImageFilter.GaussianBlur(16 * SS))

        glass_mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(glass_mask).rounded_rectangle(
            [pad, pad, W - pad - 1, H - pad - 1], radius=r_screen, fill=255)
        sweep = Image.composite(sweep, Image.new("L", (W, H), 0), glass_mask)

        white = Image.new("RGBA", (W, H), (255, 255, 255, 255))
        white.putalpha(sweep)
        body.alpha_composite(white)

    return body.resize((W // SS, H // SS), Image.LANCZOS)


def drop_shadow(device: Image.Image, canvas_size, pos, spread=1.0):
    """Two shadows: a tight dark contact shadow plus a wide soft ambient one.

    A single blurred silhouette looks like a sticker; real objects darken
    sharply where they meet a surface and diffusely everywhere else.
    """
    layer = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    alpha = device.split()[3]

    for blur, offset, opacity in ((14 * spread, 10, 150), (56 * spread, 42, 120)):
        sil = Image.new("RGBA", device.size, (0, 0, 0, 255))
        sil.putalpha(alpha.point(lambda v: int(v * opacity / 255)))
        tmp = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
        tmp.alpha_composite(sil, (pos[0], pos[1] + int(offset * spread)))
        layer = Image.alpha_composite(layer, tmp.filter(ImageFilter.GaussianBlur(blur)))

    return layer
