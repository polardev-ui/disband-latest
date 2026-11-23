"""Trace Spectre's front view into vector point lists for the sticker rig.

Usage:
    python3 trace_reference.py <turnaround.png> <out shapes.mjs> [<debug dir>]

The turnaround's front view (top-left 640 x 627 px) is segmented into the hood,
face opening, rim, cel-shading tones, torso details, legs, boots and hands. Each
region is smoothed, simplified and written in reference pixels; the rig turns the
points into Bezier curves and scales them to sticker size.
"""

import json
import sys

import cv2
import numpy as np

src, out_path = sys.argv[1], sys.argv[2]
debug_dir = sys.argv[3] if len(sys.argv) > 3 else None

img = cv2.imread(src)
front = img[0:627, 0:640].copy()
fi = front.astype(np.int32)
B, G, R = fi[..., 0], fi[..., 1], fi[..., 2]
lum = 0.299 * R + 0.587 * G + 0.114 * B
H, W = lum.shape
yy, xx = np.mgrid[0:H, 0:W]


def largest(mask):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
    if n <= 1:
        return mask.astype(bool)
    k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return lab == k


def fill_holes(mask):
    m = mask.astype(np.uint8).copy()
    inv = 1 - m
    n, lab, stats, _ = cv2.connectedComponentsWithStats(inv)
    for k in range(1, n):
        x, y, w, h, a = stats[k]
        if x > 0 and y > 0 and x + w < m.shape[1] and y + h < m.shape[0]:
            m[lab == k] = 1
    return m.astype(bool)


def soften(mask, sigma=2.5):
    blurred = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma)
    return blurred > 0.5


def drop_small(mask, min_area):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
    out = np.zeros_like(mask, dtype=bool)
    for k in range(1, n):
        if stats[k][4] >= min_area:
            out |= lab == k
    return out


def contours(mask, eps=1.6, min_area=60):
    cs, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    res = []
    for c in cs:
        if cv2.contourArea(c) < min_area:
            continue
        a = cv2.approxPolyDP(c, eps, True)[:, 0, :]
        res.append([[float(p[0]), float(p[1])] for p in a])
    res.sort(key=lambda pts: -cv2.contourArea(np.array(pts, dtype=np.float32)))
    return res


def regions(mask, eps=1.6, min_area=60):
    """Outer contours with their holes: [{"outer": [...], "holes": [[...], ...]}, ...]."""
    cs, hier = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    res = []
    if hier is None:
        return res
    hier = hier[0]
    simplify = lambda c: [[float(p[0]), float(p[1])] for p in cv2.approxPolyDP(c, eps, True)[:, 0, :]]
    for i, c in enumerate(cs):
        if hier[i][3] != -1 or cv2.contourArea(c) < min_area:
            continue
        holes = []
        j = hier[i][2]
        while j != -1:
            if cv2.contourArea(cs[j]) >= min_area:
                holes.append(simplify(cs[j]))
            j = hier[j][0]
        res.append({"outer": simplify(c), "holes": holes})
    res.sort(key=lambda r: -cv2.contourArea(np.array(r["outer"], dtype=np.float32)))
    return res


# --- Base masks -------------------------------------------------------------
char = (B - R > 12) | (lum < 135)
char = cv2.morphologyEx(char.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
char = fill_holes(largest(char))

dark_head = (lum < 75) & (yy < 330)
dark_head = cv2.morphologyEx(dark_head.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
n, lab, stats, _ = cv2.connectedComponentsWithStats(dark_head.astype(np.uint8))
void = fill_holes(lab == lab[200, 330])
void = soften(void, 2.0)

# Hood: silhouette above the shoulders, closed with the drape over the collar.
hood = char & (yy < 286)
drape = np.zeros((H, W), np.uint8)
cv2.fillPoly(
    drape,
    [np.array([[184, 278], [222, 296], [262, 306], [296, 312], [318, 318], [329, 323],
               [340, 318], [362, 312], [398, 306], [438, 296], [478, 278], [478, 270], [184, 270]],
              np.int32)],
    1,
)
hood = soften(hood | (drape > 0) | void, 3.5)
hood_solid = hood.copy()
hood_fabric = hood & ~void

# Cel-shading tones on the hood (luminance smoothed to ignore render noise).
L = cv2.GaussianBlur(lum.astype(np.float32), (0, 0), 3.0)
rim_zone = cv2.dilate(void.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (37, 37))) > 0
light = soften(drop_small(hood_fabric & (L > 203) & ~rim_zone, 400), 9.0)
shade = soften(drop_small(hood_fabric & (L < 184), 250), 4.5)
deep = soften(drop_small(hood_fabric & (L < 160), 120), 3.5)

# Rim: the rolled edge around the opening.
rim_outer = soften(cv2.dilate(void.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (35, 35))) > 0, 3)

# --- Eyes ---------------------------------------------------------------------
eye_mask = (lum > 228) & void
n, lab, stats, cent = cv2.connectedComponentsWithStats(eye_mask.astype(np.uint8))
eyes = []
for k in range(1, n):
    if stats[k][4] > 300:
        x, y, w, h, a = stats[k]
        eyes.append({"cx": float(cent[k][0]), "cy": float(cent[k][1]), "w": int(w), "h": int(h)})
eyes.sort(key=lambda e: e["cx"])

# --- Torso details ------------------------------------------------------------
torso_zone = (yy > 396) & (yy < 492) & (xx > 200) & (xx < 460)
pocket = torso_zone & char & (L < 160) & (L > 110) & (xx > 236) & (xx < 424) & (yy < 470)
pocket = soften(largest(drop_small(pocket, 400)), 3.0)
torso_rows = {}
for y in range(400, 492, 4):
    r = np.nonzero(char[y, 180:480])[0]
    if len(r):
        torso_rows[y] = [int(180 + r.min()), int(180 + r.max())]

# --- Legs, boots, hands -----------------------------------------------------------
dark = (lum < 100) & char & ~void
left_leg = soften(largest(dark & (yy > 480) & (xx < 329)), 1.5)
left_hand = largest(dark & (yy > 280) & (yy < 400) & (xx < 130))
cuff = soften(left_hand & (xx >= 79), 1.2)
mitt = soften(left_hand & (xx < 83), 1.2)

# Strings and knots (white cords hanging from the collar).
strings = (lum > 200) & (yy > 305) & (yy < 385) & (xx > 270) & (xx < 390)
n, lab, stats, cent = cv2.connectedComponentsWithStats(strings.astype(np.uint8))
cords = [
    {"x": float(cent[k][0]), "y0": int(stats[k][1]), "y1": int(stats[k][1] + stats[k][3]), "w": int(stats[k][2])}
    for k in range(1, n)
    if stats[k][4] > 120
]

# Drape corners: the strip of hood just above its bottom edge where the arms come out.
edge = np.full(W, -1)
for x in range(W):
    col = np.nonzero(hood_solid[:, x])[0]
    if len(col):
        edge[x] = col.max()
drape_zone = np.zeros((H, W), bool)
for x in range(W):
    if edge[x] > 0:
        drape_zone[max(0, edge[x] - 52):edge[x] + 1, x] = True
drape_l = soften(hood_solid & drape_zone & (xx < 300), 1.5)
drape_r = soften(hood_solid & drape_zone & (xx > 358), 1.5)

void_out = soften(cv2.dilate(void.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19))) > 0, 2)

# Pocket: keep the right half (cleaner shading) and mirror it about the body centre.
pk = contours(pocket, 1.8)[0]
right_half = [p for p in pk if p[0] >= 329]
right_half.sort(key=lambda p: p[1])
pocket_sym = right_half + [[2 * 329 - p[0], p[1]] for p in reversed(right_half)]

shapes = {
    "hood": contours(hood_solid, 1.6)[0],
    "voidOut": contours(void_out, 1.3)[0],
    "drapeL": contours(drape_l, 1.3)[0],
    "drapeR": contours(drape_r, 1.3)[0],
    "hoodLight": regions(light, 3.0, 300),
    "hoodShade": regions(shade, 2.4, 200),
    "hoodDeep": regions(deep, 2.4, 150),
    "void": contours(void, 1.2)[0],
    "rimOuter": contours(rim_outer, 1.4)[0],
    "eyes": eyes,
    "pocket": contours(pocket, 1.8)[0],
    "pocketRight": right_half,
    "torsoRows": torso_rows,
    "leg": contours(left_leg, 1.4)[0],
    "cuff": contours(cuff, 1.2)[0],
    "mitt": contours(mitt, 1.2)[0],
    "cords": cords,
}

with open(out_path, "w") as fh:
    fh.write("// Generated by tools/trace_reference.py from Spectre's front turnaround. Units: reference px.\n")
    fh.write("export default " + json.dumps(shapes, separators=(",", ":")) + ";\n")

if debug_dir:
    dbg = front.copy()
    for name, col in [("hood", (0, 0, 255)), ("void", (0, 200, 0)), ("rimOuter", (255, 0, 255)), ("pocket", (255, 0, 0)),
                      ("leg", (0, 200, 255)), ("cuff", (255, 255, 0)), ("mitt", (0, 255, 255)),
                      ("drapeL", (0, 128, 255)), ("drapeR", (0, 128, 255))]:
        cv2.polylines(dbg, [np.array(shapes[name], np.int32)], True, col, 1)
    for name, col in [("hoodLight", (255, 255, 255)), ("hoodShade", (80, 80, 160)), ("hoodDeep", (40, 40, 90))]:
        for r in shapes[name]:
            for c in [r["outer"], *r["holes"]]:
                cv2.polylines(dbg, [np.array(c, np.int32)], True, col, 1)
    cv2.imwrite(f"{debug_dir}/trace_debug.png", dbg)
    print("eyes", eyes)
    print("cords", cords)
    print({k: (len(v) if isinstance(v, list) else v) for k, v in shapes.items() if k not in ("eyes", "cords", "torsoRows")})
