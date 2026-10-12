"""Generate the model, textures, and item icon for the Yasuflatland Ride sports boat (ADR 0051).

Ported from the spike's generator (docs/spike-sportsboat.md, appendix). Coordinates are in pixels
(16 px = 1 block), forward +z and right +x, and the model is rotated 180 degrees around the Y axis
just before writing, because in Bedrock the front of an entity is on the -z side of the model.
Bones: root / body / headlights / windshield (ADR 0009). No logo or model name.
Run: python3 -I tools/gen_sportsboat.py packs/yasu_ride_rp
"""
import json
import math
import struct
import sys
import zlib
from pathlib import Path

RP = Path(sys.argv[1])
MODELS = RP / "models/entity/yasu_ride"
ENTITY_TEXTURES = RP / "textures/entity/yasu_ride"
ITEM_TEXTURES = RP / "textures/items/yasu_ride"

# Color swatches. Each color fills a 4x4 cell, and each face's UV points at the cell's center 2x2
PALETTE = {
    "hull": (20, 20, 22),  # gloss black; the paint swaps this swatch
    "trim": (176, 178, 184),  # rub rail
    "strake": (46, 46, 50),
    "gloss": (14, 14, 16),  # dash, consoles, frames
    "frame": (26, 26, 28),
    "canvas": (38, 38, 40),
    "canvas_panel": (28, 28, 30),
    "seat": (176, 116, 70),  # tan leather
    "seat_dark": (58, 58, 62),  # charcoal bolsters
    "teak": (182, 128, 84),
    "seam": (40, 30, 24),
    "glass": (196, 220, 232),
    "screen": (36, 90, 170),
    "metal": (150, 150, 156),
    "light": (232, 232, 208),
    "platform": (150, 152, 152),  # gray mat on the swim platform
    "steel": (205, 208, 212),  # stainless ladder, hinges, and trim
    "jet": (104, 106, 112),  # gray jet nozzles, reverse buckets, and speaker grilles
    "ring": (40, 92, 220),  # blue LEDs on the wheel and speakers
    "stripe": (0x61, 0x61, 0x61),  # the line along each side below the gunwale
    "gunmetal": (74, 76, 82),  # matte speaker pods
    "chrome": (226, 228, 232),
    "button": (60, 60, 64),
}
# The windshield renders with entity_alphablend, so its swatch is see-through
ALPHA = {"glass": 80}
NAMES = list(PALETTE)
TEXTURE_WIDTH = 128
TEXTURE_HEIGHT = 32
assert len(NAMES) * 4 <= TEXTURE_WIDTH, "the palette no longer fits in the texture"

# Hull color of each paint, in variant order (ADR 0031). Variant 0, khaki on the SUV, is black here,
# so a new boat is black (ADR 0051). Khaki writes sportsboat.png; the others write sportsboat_<paint>.png.
HULL_PAINTS = {
    "khaki": (20, 20, 22),
    "green": (62, 96, 56),
    "red": (128, 22, 26),
    "white": (222, 222, 216),
    "light_gray": (156, 156, 152),
    "gray": (92, 94, 98),
    "black": (20, 20, 22),
    "orange": (190, 92, 28),
    "yellow": (214, 178, 44),
    "lime": (112, 160, 42),
    "cyan": (30, 118, 124),
    "light_blue": (92, 150, 204),
    "blue": (34, 70, 170),
    "purple": (94, 46, 128),
    "magenta": (160, 52, 140),
    "pink": (214, 132, 162),
}


def uv(color):
    i = NAMES.index(color)
    face = {"uv": [i * 4 + 1, 1], "uv_size": [2, 2]}
    return {k: dict(face) for k in ("north", "south", "east", "west", "up", "down")}


# A quilted tile below the swatch row: tan with a darker honeycomb stitch, as on the reference boat's
# cushions, stretched over a whole face.
QUILT_UV = {"uv": [0, 16], "uv_size": [8, 8]}
QUILT_LINE = (128, 80, 44)
QUILT = [
    "........",
    ".LL..LL.",
    "L..LL..L",
    "........",
    "........",
    "L..LL..L",
    ".LL..LL.",
    "........",
]


def box(x0, y0, z0, x1, y1, z1, color, faces=None, **extra):
    """`faces` names the faces ("up", "south", ...) that get the quilted tile instead of the color."""
    face_uv = uv(color)
    for face in faces or ():
        face_uv[face] = dict(QUILT_UV)
    return {"origin": [x0, y0, z0], "size": [x1 - x0, y1 - y0, z1 - z0], "uv": face_uv, **extra}


def pair(x0, y0, z0, x1, y1, z1, color, **extra):
    """A box on the right (+x) and its mirror on the left."""
    return [box(x0, y0, z0, x1, y1, z1, color, **extra), box(-x1, y0, z0, -x0, y1, z1, color, **extra)]


def disc(cx, cy, r, z0, z1, color):
    """A round section along z: a square and the same square turned 45 degrees."""
    return [box(cx - r, cy - r, z0, cx + r, cy + r, z1, color, pivot=[cx, cy, z0], rotation=[0, 0, rot])
            for rot in (0, 45)]


def lerp(table, z):
    if z <= table[0][0]:
        return table[0][1]
    for (z0, v0), (z1, v1) in zip(table, table[1:]):
        if z <= z1:
            return v0 + (v1 - v0) * (z - z0) / (z1 - z0)
    return table[-1][1]


# Profiles read off the side photo: 6 blocks long (z -48..48), keel at y 0. 900 photo pixels = 96 model pixels.
SHEER = [(-48, 9.5), (-44, 11.5), (-40, 13), (-32, 15.5), (-21, 16.8), (0, 17.4), (22, 17.6), (38, 17.8), (48, 18.4)]
KEEL = [(-48, 7), (-44.5, 2.5), (-39, 0), (-10, 0), (16, 0.7), (28, 2.6), (37, 5.9), (43, 10.1), (46.5, 14.4), (48, 17.4)]
BEAM = [(-48, 14.5), (-46.5, 16.3), (-44, 17), (8, 17), (20, 15.6), (30, 12.6), (38, 8.6), (44, 4.6), (47, 2), (48.5, 0.6)]
STRAKE = [(-48, 5), (0, 7.5), (40, 11.5)]
DECK = 9.0  # cockpit floor
DECK_BOW = 11.0  # the open bow's floor, a step up through the windshield's walk-through
COCKPIT = (-44.0, 14.0)  # open from the transom to the consoles
BOW = (18.0, 40.0)  # open bow seating; ahead of it, the anchor locker is decked over
BOW_FILLER = 26.0  # the filler cushions start here, ahead of the floor inside the walk-through
WALK_HALF = 3.5  # half the walk-through: the reference's 22 inches is 7 px at this scale
LOUNGE_BASE = DECK_BOW + 2.2  # top of the bow lounge's charcoal base
LOUNGE_CUSHION = DECK_BOW + 3.2  # top of its tan cushion
SLICE = 2.0

body, glass = [], []


def sheer(z):
    return lerp(SHEER, z)


def beam(z):
    return lerp(BEAM, z)


# Hull: 2-pixel slices; inside each, the V bottom widens in steps up to the chine.
V_STEPS = [(0.0, 0.3), (1.5, 0.55), (3.0, 0.78), (4.5, 1.0)]
z = -48.0
while z < 48.0:
    zc = z + SLICE / 2
    s, k, b = sheer(zc), lerp(KEEL, zc), beam(zc)
    open_cockpit = COCKPIT[0] <= zc <= COCKPIT[1]
    open_bow = BOW[0] <= zc <= BOW[1]
    top = min(s, DECK) if open_cockpit else min(s, DECK_BOW) if open_bow else s
    for i, (off, frac) in enumerate(V_STEPS):
        y0 = k + off
        y1 = min(k + V_STEPS[i + 1][0], top) if i + 1 < len(V_STEPS) else top
        if y1 > y0:
            body.append(box(-b * frac, y0, z, b * frac, y1, z + SLICE, "hull"))
    if open_cockpit and s > DECK:
        body += pair(b - 1.6, DECK, z, b, s, z + SLICE, "hull")
    if open_bow:
        body += pair(b - 1.6, DECK_BOW, z, b, s, z + SLICE, "hull")
        body.append(box(-b + 1.6, DECK_BOW, z, b - 1.6, DECK_BOW + 0.3, z + SLICE, "teak"))
        # U-shaped bow lounge along the sides: charcoal base, tan cushion with charcoal piping on its
        # inboard edge, and a tan back capped in charcoal
        inner = max(b - 7.5, 0.0)
        body += pair(inner, DECK_BOW, z, b - 1.6, LOUNGE_BASE, z + SLICE, "seat_dark")
        body += pair(inner + 0.6, LOUNGE_BASE, z, b - 1.6, LOUNGE_CUSHION, z + SLICE, "seat")
        if inner > 0:
            body += pair(inner, LOUNGE_BASE, z, inner + 0.6, LOUNGE_CUSHION + 0.1, z + SLICE, "seat_dark")
        body += pair(b - 2.8, LOUNGE_CUSHION, z, b - 1.6, s - 0.9, z + SLICE, "seat")
        body += pair(b - 3.0, s - 0.9, z, b - 1.6, s - 0.3, z + SLICE, "seat_dark")
        # Filler cushions close the aisle into one sun pad, leaving room to stand inside the
        # walk-through
        if zc > BOW_FILLER and inner > 0:
            body.append(box(-inner, DECK_BOW, z, inner, LOUNGE_BASE, z + SLICE, "seat_dark"))
            body.append(box(-inner, LOUNGE_BASE, z, inner, LOUNGE_CUSHION, z + SLICE, "seat"))
            body.append(box(-0.15, LOUNGE_CUSHION, z, 0.15, LOUNGE_CUSHION + 0.1, z + SLICE, "seam"))
    # Rub rail just below the gunwale, and a faint strake lower down
    body += pair(b, s - 1.1, z, b + 0.35, s - 0.4, z + SLICE, "stripe")
    sy = lerp(STRAKE, zc)
    if k + 4.5 < sy < s - 2 and zc < 44:
        body += pair(b, sy, z, b + 0.2, sy + 0.4, z + SLICE, "strake")
    z += SLICE

# Swim platform: gray mat with seams, a stainless edge, a ladder down into the water on the right,
# and below it the drive and a black fin
body.append(box(-15.5, 5.6, -53, 15.5, 7.0, -47.5, "frame"))
body.append(box(-15, 7.0, -52.5, 15, 7.4, -47.5, "platform"))
for x in (-5.2, 4.9):
    body.append(box(x, 7.4, -52.5, x + 0.3, 7.5, -47.5, "seam"))
body.append(box(-15.7, 6.6, -53.4, 15.7, 7.2, -52.9, "trim"))
body += pair(15.5, 6.6, -53, 15.9, 7.2, -47.5, "trim")
for x in (7.5, 11.5):
    body.append(box(x, -6, -53.8, x + 0.5, 6.0, -53.3, "steel"))
for y in (-4.5, -1.5, 1.5, 4.5):
    body.append(box(7.5, y, -54.4, 12, y + 0.5, -53.3, "steel"))
# Jet drive under the platform: a black tunnel in the transom, a black housing between twin gray
# nozzles, each a round tube (a square and the same square turned 45 degrees) under a hooded
# reverse bucket. No propeller.
body.append(box(-9, 1.0, -48.5, 9, 5.6, -47.0, "gloss"))  # tunnel back
body.append(box(-2.2, 0.8, -51.5, 2.2, 5.6, -47.0, "gloss"))  # center housing
body.append(box(-2.4, 0.4, -52, 2.4, 1.2, -49, "gloss"))
for cx in (-5.0, 5.0):
    cy = 3.0
    for rot in (0, 45):
        body.append(box(cx - 1.3, cy - 1.3, -51.5, cx + 1.3, cy + 1.3, -48.5, "jet",
                        pivot=[cx, cy, -50], rotation=[0, 0, rot]))
    body.append(box(cx - 0.8, cy - 0.8, -51.7, cx + 0.8, cy + 0.8, -51.5, "gloss"))  # bore
    body.append(box(cx - 2.0, cy + 0.8, -50.5, cx + 2.0, 5.6, -47.5, "jet"))  # bucket hood
    # Aft lip of the hood, hinged at its top front edge. Its free aft edge (toward -z) droops toward
    # the water. In game a negative x rotation tips +y toward +z, so it also lifts -z; a positive
    # angle turns -z down, before the 180-degree turn (ADR 0051).
    body.append(box(cx - 1.6, cy + 0.2, -51.3, cx + 1.6, cy + 1.8, -50.5, "jet",
                    pivot=[cx, cy + 1.8, -50.5], rotation=[25, 0, 0]))
body.append(box(-0.3, -2.5, -49, 0.3, 1.0, -44, "gloss"))  # articulating keel
body.append(box(-14.4, 0.5, -51.5, -14.0, 5.6, -47, "frame"))
body.append(box(-14.0, 3.0, -50, -10, 3.6, -48.5, "frame"))

# Teak floor with dark inlay lines along the center aisle and across it
body.append(box(-15.4, DECK, -44, 15.4, DECK + 0.3, 14, "teak"))
for x in (-2.6, 2.3):
    body.append(box(x, DECK + 0.3, -44, x + 0.3, DECK + 0.4, 14, "seam"))
for zl in (-24, -7, 10):
    body.append(box(-15.4, DECK + 0.3, zl, 15.4, DECK + 0.4, zl + 0.3, "seam"))
F = DECK + 0.3  # top of the floor


def striped(x0, x1, y0, y1, z0, z1, quilt_face):
    """A seat panel split across its width like the photo: tan sides, charcoal stripes, quilted center."""
    w = x1 - x0
    edges = [x0, x0 + w * 0.26, x0 + w * 0.33, x0 + w * 0.67, x0 + w * 0.74, x1]
    colors = ["seat", "seat_dark", "seat", "seat_dark", "seat"]
    return [box(a, y0, z0, b, y1, z1, c, faces=[quilt_face] if i == 2 else None)
            for i, (a, b, c) in enumerate(zip(edges, edges[1:], colors))]


# Helm (right, the driver is seat 0) and passenger buckets on pedestals, wraparound like the reference:
# a charcoal shell, tall tan wings, a headrest, and a flip-up bolster at the front of the cushion
for sign in (1, -1):
    a, c = (2.5, 10) if sign > 0 else (-10, -2.5)
    body.append(box(a + 2.5, F, 3, c - 2.5, F + 0.5, 6, "metal"))  # pedestal
    body.append(box(a, F + 0.5, 0.5, c, F + 1.6, 8, "seat_dark"))  # base shell
    body += striped(a, c, F + 1.6, F + 2.8, 2, 5.6, "up")  # cushion
    body.append(box(a + 0.3, F + 1.6, 5.6, c - 0.3, F + 2.6, 5.9, "seat_dark"))  # bolster hinge
    body.append(box(a, F + 1.6, 5.9, c, F + 3.4, 8, "seat"))  # flip-up bolster, folded down
    body.append(box(a, F + 1.6, 0, c, F + 10, 1.6, "seat_dark"))  # back shell
    body += striped(a + 0.6, c - 0.6, F + 3, F + 9.6, 1.6, 2.0, "south")  # face toward the sitter
    body.append(box(a + 0.8, F + 10, 0.2, c - 0.8, F + 11, 1.8, "seat_dark"))  # headrest
    for x0, x1, shell0, shell1 in ((a - 0.6, a, a - 0.9, a), (c, c + 0.6, c, c + 0.6 + 0.3)):
        body.append(box(x0, F + 1.6, 0, x1, F + 9, 3.5, "seat"))  # tall wing
        body.append(box(x0, F + 1.6, 3.5, x1, F + 4.6, 8, "seat"))  # arm
        body.append(box(shell0, F + 0.5, 0, shell1, F + 1.6, 8, "seat_dark"))  # shell under the wing

# Aft U lounge, as on the reference: a bench across the transom, side benches along the hull facing
# inboard, and at their front ends forward-facing seats with flip-back backrests for seats 2 and 3.
# Seats 2 and 3 in sportsboat.se.json sit on these forward-facing seats (ADR 0058).
U_SIDE = 9.4  # inboard edge of each side bench


def side(sign, x0, x1):
    """The span x0..x1 on the right (sign 1), or its mirror on the left (sign -1)."""
    return (x0, x1) if sign > 0 else (-x1, -x0)


for sign in (1, -1):
    # Forward-facing seat (seat 2 or 3)
    x0, x1 = side(sign, 2.6, 15.4)
    body.append(box(x0, F, -17, x1, F + 2.6, -9, "seat_dark"))
    body += striped(x0, x1, F + 2.6, F + 3.6, -17, -9, "up")
    # Flip-back backrest: a charcoal frame round a tan face, on steel hinges at both ends
    body.append(box(x0, F + 2.6, -18.6, x1, F + 8.4, -17.6, "seat_dark"))
    body += striped(x0 + 0.4, x1 - 0.4, F + 4.0, F + 8.0, -17.6, -17.2, "south")
    for hx in (x0 - 0.1, x1 - 0.3):
        body.append(box(hx, F + 3.2, -18.4, hx + 0.4, F + 4.4, -17.4, "steel"))
    # Side bench, its base running under the backrest to meet the forward seat
    x0, x1 = side(sign, U_SIDE, 15.4)
    body.append(box(x0, F, -38, x1, F + 2.6, -17, "seat_dark"))
    cx0, cx1 = side(sign, U_SIDE + 0.6, 14.2)
    body.append(box(cx0, F + 2.6, -38, cx1, F + 3.6, -18.6, "seat", faces=["up"]))
    px0, px1 = side(sign, U_SIDE, U_SIDE + 0.6)
    body.append(box(px0, F + 2.6, -38, px1, F + 3.7, -18.6, "seat_dark"))  # piping
    bx0, bx1 = side(sign, 14.2, 15.4)
    body.append(box(bx0, F + 2.6, -42, bx1, F + 6.4, -18.6, "seat"))  # back against the hull
    tx0, tx1 = side(sign, 14.0, 15.4)
    body.append(box(tx0, F + 6.4, -42, tx1, F + 7.0, -18.6, "seat_dark"))
    # Round chrome speaker grille set into the side back, aft of the tower legs
    gx0, gx1 = side(sign, 13.9, 14.2)
    gx = (gx0 + gx1) / 2
    for rot in (0, 45):
        body.append(box(gx0, F + 3.9, -27.9, gx1, F + 5.7, -26.1, "chrome",
                        pivot=[gx, F + 4.8, -27], rotation=[rot, 0, 0]))
    hx0, hx1 = side(sign, 13.8, 13.9)
    body.append(box(hx0, F + 4.4, -27.4, hx1, F + 5.2, -26.6, "gloss"))  # cone

# Transom bench across the stern, under the side benches' back ends
body.append(box(-15.4, F, -44, 15.4, F + 2.6, -38, "seat_dark"))
body += striped(-14.2, 14.2, F + 2.6, F + 3.8, -42, -38, "up")
body += striped(-15.4, 15.4, F + 3.8, F + 6.8, -44, -42, "south")
body.append(box(-15.4, F + 6.8, -44, 15.4, F + 7.4, -42, "seat_dark"))  # charcoal cap
body.append(box(-15.4, F + 3.8, -44, 15.4, F + 4.4, -42.4, "seat_dark"))  # charcoal band

# Helm console with a glossy dash, a big display, a wheel, and the throttle; passenger console
body.append(box(WALK_HALF, F, 9, 15.4, F + 7, 16, "gloss"))
body.append(box(WALK_HALF, F + 7, 10, 15.4, F + 8, 15.5, "gloss"))
body.append(box(-15.4, F, 9, -WALK_HALF, F + 6.5, 16, "gloss"))
body.append(box(-15.4, F + 6.5, 10, -WALK_HALF, F + 7.3, 15.5, "gloss"))
# Tan leather panel on each side wall beside the front seats
body += pair(15.0, F + 3.5, -1.0, 15.4, sheer(2) - 1.2, 4.8, "seat")
body += pair(14.9, F + 3.0, -1.0, 15.4, F + 3.5, 4.8, "seat_dark")
# A large display inboard of the wheel, as on the reference helm, overhanging the console toward the
# aisle. It stands ahead of the driver (bow at +z), and its top leans away from the driver, toward +z.
# In game a negative x rotation tips +y toward +z before the 180-degree turn, so the angle is -20;
# render_preview.py draws it leaning the other way (ADR 0051).
SCREEN_PIVOT = [5.5, F + 8, 13.5]
body.append(box(2.0, F + 8, 13, 9.0, F + 12.4, 14, "gloss", pivot=SCREEN_PIVOT, rotation=[-20, 0, 0]))
body.append(box(2.4, F + 8.4, 12.8, 8.6, F + 12.0, 13.1, "screen", pivot=SCREEN_PIVOT, rotation=[-20, 0, 0]))
# Phone holder standing on the dash, and a switch panel outboard of it
body.append(box(11.0, F + 8, 12.4, 12.4, F + 10.6, 12.9, "gloss"))
body.append(box(11.2, F + 8.3, 12.3, 12.2, F + 10.4, 12.4, "screen"))
body.append(box(12.8, F + 8, 10.6, 15.0, F + 8.3, 13.4, "gloss"))
for bx in (13.1, 13.8, 14.5):
    for bz in (11.2, 12.4):
        body.append(box(bx, F + 8.3, bz, bx + 0.4, F + 8.45, bz + 0.4, "metal"))
# Two chrome-rimmed cupholders: on the dash between the display and the wheel, and on the ledge below
for x0, y0, z0, size in ((9.6, F + 8, 10.4, 1.3), (3.9, F + 7, 9.0, 1.0)):
    body.append(box(x0, y0, z0, x0 + size, y0 + 0.15, z0 + size, "chrome"))
    body.append(box(x0 + 0.25, y0 + 0.15, z0 + 0.25, x0 + size - 0.25, y0 + 0.17, z0 + size - 0.25, "gloss"))
# Steering wheel as on the reference: a thick black rim and a broad black three-spoke pad with
# chrome strips along the lower edges of the side spokes, small buttons, one blue
# LED, and a plain silver cap with no emblem (ADR 0009). The column sits under a thick glossy cowl.
WX, WY, WZ = 7.6, F + 7.5, 7.0  # wheel center; the driver faces its -z side
# The rim is 40 short segments, so its outline reads as a circle rather than a polygon. A full-depth
# core with thinner bands along its inner and outer edges rounds off the rim's cross-section.
RIM_SEGMENTS = 40
for r, half, z0, z1 in ((2.7, 0.3, WZ, WZ + 0.8), (2.325, 0.075, WZ + 0.15, WZ + 0.65),
                        (3.075, 0.075, WZ + 0.15, WZ + 0.65)):
    # Long enough to meet the next segment along the band's outer edge
    half_len = math.pi * (r + half) / RIM_SEGMENTS
    for i in range(RIM_SEGMENTS):
        ang = i * 360 / RIM_SEGMENTS
        cx = WX + r * math.cos(math.radians(ang))
        cy = WY + r * math.sin(math.radians(ang))
        body.append(box(cx - half_len, cy - half, z0, cx + half_len, cy + half, z1, "gloss",
                        pivot=[cx, cy, (z0 + z1) / 2], rotation=[0, 0, ang + 90]))
for ang in (20, 160, 270):
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    cx, cy = WX + 1.3 * ca, WY + 1.3 * sa
    body.append(box(cx - 1.2, cy - 0.75, WZ + 0.15, cx + 1.2, cy + 0.75, WZ + 0.6, "gloss",
                    pivot=[cx, cy, WZ + 0.4], rotation=[0, 0, ang]))
    if ang != 270:
        # Across the spoke, pointing down on either side
        dx, dy = (sa, -ca) if ca > 0 else (-sa, ca)
        lx, ly = cx + 0.7 * dx, cy + 0.7 * dy
        body.append(box(lx - 1.1, ly - 0.12, WZ + 0.05, lx + 1.1, ly + 0.12, WZ + 0.15, "chrome",
                        pivot=[lx, ly, WZ + 0.1], rotation=[0, 0, ang]))
        for r in (0.9, 1.6):
            bx, by = WX + r * ca - 0.15 * dx, WY + r * sa - 0.15 * dy
            body.append(box(bx - 0.2, by - 0.2, WZ + 0.05, bx + 0.2, by + 0.2, WZ + 0.15, "button",
                            pivot=[bx, by, WZ + 0.1], rotation=[0, 0, ang]))
body += disc(WX, WY, 1.3, WZ + 0.1, WZ + 0.7, "gloss")  # pad center
body += disc(WX, WY, 0.6, WZ - 0.05, WZ + 0.1, "steel")  # cap
lx, ly = WX + 0.45, WY - 1.9
body.append(box(lx - 0.15, ly - 0.15, WZ + 0.05, lx + 0.15, ly + 0.15, WZ + 0.15, "ring"))  # LED
body.append(box(WX - 1.0, WY - 1.6, WZ + 0.6, WX + 1.0, WY + 0.6, 9.0, "gloss"))  # cowl
body.append(box(WX - 1.05, WY - 1.65, WZ + 1.0, WX + 1.05, WY + 0.65, WZ + 1.2, "chrome"))
body.append(box(WX - 0.7, F + 4, 8.2, WX + 0.7, WY - 1.6, 9.0, "gloss"))  # column
# Throttle on the right side wall beside the driver: a glossy black housing with a chrome
# handle on a black lever arm, as in the photo
body.append(box(13.4, F + 4.5, 5.0, 15.4, F + 7.4, 9.0, "gloss"))
body.append(box(12.6, F + 7.0, 6.2, 14.2, F + 7.8, 8.6, "gloss"))  # lever arm
body.append(box(11.4, F + 7.4, 6.6, 12.8, F + 8.8, 8.4, "steel"))  # chrome handle
body.append(box(11.6, F + 8.8, 6.9, 12.6, F + 9.2, 8.1, "steel"))

# Wraparound windshield: side panes follow the gunwale back to z -10; the front leans back toward
# the cockpit about 55 degrees, built from thin rows that each step aft, and the side panes are cut
# along the same slope where they meet it.
WS_TOP = [(-12, 0.0), (-10, 1.8), (0, 3.4), (12, 4.3), (16, 4.5)]  # glass height above the sheer
WS_HEIGHT = 4.5
FRONT_BASE, FRONT_TOP = 22.0, 15.5  # z of the front glass at the sheer and at its top edge
RAKE = (FRONT_BASE - FRONT_TOP) / WS_HEIGHT  # blocks aft per block up
WS_ROWS = 9


def glass_height(z):
    return max(0.0, min(lerp(WS_TOP, z), (FRONT_BASE - z) / RAKE))


z = -10.0
while z < FRONT_BASE:
    zc = z + SLICE / 2
    s, b, h = sheer(zc), beam(zc), glass_height(zc)
    if h > 0.3:
        glass += pair(b - 1.5, s, z, b - 1.0, s + h, z + SLICE, "glass")
        body += pair(b - 1.7, s + h, z, b - 0.8, s + h + 0.7, z + SLICE, "frame")  # top rail
    z += SLICE
s0 = sheer(FRONT_BASE)
ROW_HEIGHT = WS_HEIGHT / WS_ROWS
# (bottom y, front z) of each row of the front glass
ROWS = [(s0 + r * WS_HEIGHT / WS_ROWS, FRONT_BASE - r * (FRONT_BASE - FRONT_TOP) / WS_ROWS) for r in range(WS_ROWS)]
POST = WALK_HALF + 0.6  # outer face of each walk-through post
RAIL_Y = s0 + WS_HEIGHT  # bottom of the front glass's top rail
for y0, zf in ROWS:
    # The center section is the walk-through to the bow
    glass += pair(POST, y0, zf - 0.9, beam(zf) - 1.0, y0 + ROW_HEIGHT, zf, "glass")
body += pair(POST - 0.2, RAIL_Y, FRONT_TOP - 1.0, beam(FRONT_TOP) - 1.0, RAIL_Y + 0.7, FRONT_TOP + 0.2, "frame")
# Walk-through posts lean back with the glass: one short block per row
for y0, zf in ROWS:
    body += pair(WALK_HALF, y0, zf - 0.9, POST, y0 + ROW_HEIGHT + 0.05, zf, "frame")
# Corner posts where the front meets the sides, a divider halfway across each front pane, and a mid
# post on each side pane
for y0, zf in ROWS:
    hw = beam(zf) - 1.0
    body += pair(hw - 0.6, y0, zf - 0.9, hw, y0 + ROW_HEIGHT + 0.05, zf, "frame")
    mid = (POST + hw) / 2
    body += pair(mid - 0.25, y0, zf - 0.95, mid + 0.25, y0 + ROW_HEIGHT + 0.05, zf + 0.05, "frame")
# The walk-through door is closed: its glass leans back in line with the front panes, under the top rail
for y0, zf in ROWS:
    glass.append(box(-WALK_HALF, y0, zf - 0.9, WALK_HALF, y0 + ROW_HEIGHT, zf, "glass"))
body.append(box(-WALK_HALF, RAIL_Y, FRONT_TOP - 1.0, WALK_HALF, RAIL_Y + 0.7, FRONT_TOP + 0.2, "frame"))
# Rear-view mirror on a stalk over the helm half of the windshield's top rail, its glass facing aft
MX, MY, MZ = 8.5, RAIL_Y + 0.7, FRONT_TOP - 0.4
body.append(box(MX - 0.3, MY, MZ - 0.3, MX + 0.3, MY + 1.0, MZ + 0.3, "frame"))
body.append(box(MX - 3.4, MY + 0.8, MZ - 0.9, MX + 3.4, MY + 2.2, MZ - 0.3, "gloss"))
body.append(box(MX - 3.1, MY + 1.0, MZ - 1.0, MX + 3.1, MY + 2.0, MZ - 0.9, "chrome"))
body += pair(beam(6) - 1.6, sheer(6), 5.6, beam(6) - 1.0, sheer(6) + glass_height(6) + 0.2, 6.4, "frame")

# Wake tower: on each gunwale a raked rear and front strut with rungs and an X brace, then the top beam.
TX = 15.6  # inner face of the legs
TOWER_TOP = 32.5  # the bimini top then sits 1.97 blocks over the waterline: 8 ft 1 in at this scale


def strut(z0, y0, z1, y1, t=1.6):
    dz, dy = z1 - z0, y1 - y0
    length = math.hypot(dz, dy)
    # Lean the box from vertical toward +z. In game a negative x rotation does this, before the
    # 180-degree turn; render_preview.py draws cube x rotations the other way round (ADR 0051).
    ang = math.degrees(math.atan2(dz, dy))
    return pair(TX, y0, z0 - t / 2, TX + 1.6, y0 + length, z0 + t / 2, "frame",
                pivot=[TX + 0.8, y0, z0], rotation=[-ang, 0, 0])


# Raked about 50 degrees and roughly parallel; they end 3 px either side of the middle of the short
# top over the helm.
REAR = ((-23.0, sheer(-23)), (-3.0, TOWER_TOP))
FRONT = ((-14.0, sheer(-14)), (3.0, TOWER_TOP))


def on(line, y):
    (z0, y0), (z1, y1) = line
    return z0 + (z1 - z0) * (y - y0) / (y1 - y0)


body += strut(*REAR[0], *REAR[1])
body += strut(*FRONT[0], *FRONT[1])
for y in (21.5, 26.0):
    body += strut(on(REAR, y), y, on(FRONT, y), y + 0.01, t=1.0)
body += strut(on(REAR, 22.5), 22.5, on(FRONT, 30.0), 30.0, t=0.8)
body += strut(on(REAR, 30.0), 30.0, on(FRONT, 22.5), 22.5, t=0.8)
body.append(box(-TX - 1.6, TOWER_TOP, -4.5, TX + 1.6, TOWER_TOP + 1.5, 4.0, "frame"))
# Board racks on the outside of the rear struts
RACK_Z = on(REAR, 25.0)
for y in (23.5, 28.0):
    body += pair(TX + 1.6, y, RACK_Z - 0.3, TX + 4.2, y + 0.6, RACK_Z + 0.3, "frame")
body += pair(TX + 3.6, 22.5, RACK_Z - 0.5, TX + 4.2, 29.0, RACK_Z + 4.5, "frame")

# Bimini: a thick soft top that dips toward the bow and crowns slightly; only the front edge rolls
# down, the rear edge stays straight. A darker panel sits on top, and the side edges roll down too.
B_FRONT, B_REAR = 9.0, -10.0  # over the helm only
B_HALF = 19.0
B_TOP = TOWER_TOP + 3.5
B_THICK = 2.0


def bimini_top(zc):
    front = B_FRONT - zc
    t = (zc - B_REAR) / (B_FRONT - B_REAR)
    drop = 2.4 if front < 1.5 else 1.2 if front < 3.5 else 0.0
    return B_TOP - drop - 1.5 * t + 0.6 * (1 - (2 * t - 1) ** 2)


z = B_REAR
while z < B_FRONT:
    zc = z + SLICE / 2
    front = B_FRONT - zc
    rear = zc - B_REAR
    corner = 2.0 if min(front, rear) < 1.5 else 0.8 if min(front, rear) < 3.5 else 0.0
    hw = B_HALF - corner
    top = bimini_top(zc)
    body.append(box(-hw + 3, top - B_THICK, z, hw - 3, top, z + SLICE, "canvas"))
    # Two ribs under the top run from near the middle of the front edge out toward the rear corners
    rib = 3.0 + (B_HALF - 8.0 - 3.0) * front / (B_FRONT - B_REAR)
    body += pair(rib - 0.4, top - B_THICK - 0.4, z, rib + 0.4, top - B_THICK, z + SLICE, "frame")
    if B_REAR + 4 <= z and z + SLICE <= B_FRONT - 4:
        body.append(box(-9, top, z, 9, top + 0.25, z + SLICE, "canvas_panel"))
    body += pair(hw - 3, top - B_THICK - 0.8, z, hw - 1, top - 0.3, z + SLICE, "canvas")
    body += pair(hw - 1, top - B_THICK - 1.6, z, hw, top - 1.0, z + SLICE, "canvas")
    z += SLICE

# Tower speakers set into the underside of the top near its rear edge, a quarter of the way in from
# each side, facing aft as on the reference. Each is a bullet-shaped matte pod that narrows toward
# the bow, with a blue LED ring behind the bezel and a grille of split spokes round a hub.
G = B_REAR + 1.4  # z of the grille face
under = bimini_top(G + 3) - B_THICK
cy = under - 1.6
for sx in (-B_HALF / 2, B_HALF / 2):
    body += disc(sx, cy, 1.6, G - 0.05, G, "gloss")  # behind the grille
    for ang in range(0, 360, 60):
        ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        for off in (-0.2, 0.2):
            px, py = sx + 1.05 * ca - off * sa, cy + 1.05 * sa + off * ca
            body.append(box(px - 0.55, py - 0.08, G - 0.15, px + 0.55, py + 0.08, G - 0.05, "jet",
                            pivot=[px, py, G - 0.1], rotation=[0, 0, ang]))
    body += disc(sx, cy, 0.45, G - 0.25, G - 0.05, "jet")  # hub
    body += disc(sx, cy, 1.9, G, G + 0.5, "gunmetal")  # bezel
    body += disc(sx, cy, 1.95, G + 0.5, G + 0.7, "ring")  # LED ring
    for r, z0, z1 in ((1.9, 0.7, 2.4), (1.6, 2.4, 3.6), (1.15, 3.6, 4.5), (0.6, 4.5, 5.0)):
        body += disc(sx, cy, r, G + z0, G + z1, "gunmetal")
    body.append(box(sx - 0.5, cy + 1.4, G + 1.5, sx + 0.5, under, G + 3.0, "gloss"))  # mount
# Stainless bow rails on the foredeck
for z0 in (34.0, 38.0, 42.0):
    body += pair(beam(z0 + 0.4) - 1.6, sheer(z0), z0, beam(z0 + 0.4) - 1.1, sheer(z0) + 1.8, z0 + 0.5, "steel")
z = 34.0
while z < 43.0:
    body += pair(beam(z + 1) - 1.6, sheer(z) + 1.6, z, beam(z + 1) - 1.1, sheer(z) + 2.1, z + 1.0, "steel")
    z += 1.0

# Headlights: a slim teardrop lens set into each bow flank, flush with the hull slice it sits on
# and following the sheer, widest at the rear and tapering to a point toward the stem.
headlights = []
LAMP = (32.0, 42.0)  # on hull slice boundaries, so each lens segment covers exactly one slice
zl = LAMP[0]
while zl < LAMP[1]:
    hull_b = beam(zl + SLICE / 2)
    t = (zl + SLICE / 2 - LAMP[0]) / (LAMP[1] - LAMP[0])
    h = 1.5 * (1 - t) + 0.4 * t
    yc = sheer(zl + SLICE / 2) - 3.2 + 1.2 * t
    headlights += pair(hull_b - 0.05, yc - h / 2, zl, hull_b + 0.15, yc + h / 2, zl + SLICE, "light")
    # The step to the next, narrower slice exposes this segment's front face; cap it with lens too
    if zl + SLICE < LAMP[1]:
        next_b = beam(zl + SLICE * 1.5)
        headlights += pair(next_b, yc - h / 2, zl + SLICE - 0.15, hull_b + 0.15, yc + h / 2, zl + SLICE, "light")
    zl += SLICE

geo = {
    "format_version": "1.12.0",
    "minecraft:geometry": [{
        "description": {
            "identifier": "geometry.yasu_ride.sportsboat",
            "texture_width": TEXTURE_WIDTH, "texture_height": TEXTURE_HEIGHT,
            "visible_bounds_width": 8, "visible_bounds_height": 4, "visible_bounds_offset": [0, 1.5, 0],
        },
        "bones": [
            # The bow rise and the roll turn the whole boat about this point, in the aft third
            # at the waterline, so the bow lifts and the stern squats a little (ADR 0059)
            {"name": "root", "pivot": [0, 7, -20]},
            # Where the wake leaves each jet nozzle's bore
            {"name": "body", "parent": "root", "pivot": [0, 7, 0], "cubes": body,
             "locators": {"jet_left": [-5.0, 3.0, -52.0], "jet_right": [5.0, 3.0, -52.0]}},
            {"name": "headlights", "parent": "body", "pivot": [0, 7, 0], "cubes": headlights},
            {"name": "windshield", "parent": "body", "pivot": [0, 7, 0], "cubes": glass},
        ],
    }],
}


def turn_around(bones):
    """Rotate 180 degrees around the Y axis (negate x and z)."""
    for bone in bones:
        if "pivot" in bone:
            bone["pivot"] = [-bone["pivot"][0], bone["pivot"][1], -bone["pivot"][2]]
        for name, (lx, ly, lz) in bone.get("locators", {}).items():
            bone["locators"][name] = [-lx, ly, -lz]
        for cube in bone.get("cubes", []):
            (x, y, z), (w, h, d) = cube["origin"], cube["size"]
            cube["origin"] = [-(x + w), y, -(z + d)]
            if "pivot" in cube:
                cube["pivot"] = [-cube["pivot"][0], cube["pivot"][1], -cube["pivot"][2]]
            if "rotation" in cube:
                rx, ry, rz = cube["rotation"]
                # Turning around negates z rotations too, but the game turns a cube's z rotation the
                # other way from the right-handed one this file builds with, so keeping rz lets the
                # game show the angles as written (ADR 0058). x rotations are written in the game's
                # sense already (ADR 0051).
                cube["rotation"] = [-rx, ry, rz]
            # Turning around swaps which way each face points; quilted faces must follow
            f = cube["uv"]
            f["north"], f["south"], f["east"], f["west"] = f["south"], f["north"], f["west"], f["east"]


def rounded(value):
    """Round floats to 4 places to drop float noise such as 5.714285714285714. The file is written
    compact because `indent=1` output exceeds Biome's 1 MiB `files.maxSize`, and `pnpm model` could
    no longer format it."""
    if isinstance(value, float):
        return round(value, 4) + 0.0  # + 0.0 turns -0.0 into 0.0
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


MODELS.mkdir(parents=True, exist_ok=True)
turn_around(geo["minecraft:geometry"][0]["bones"])
(MODELS / "sportsboat.geo.json").write_text(json.dumps(rounded(geo), separators=(",", ":")))


def png(path, w, h, pixel):
    # pixel returns (r, g, b) for an opaque texel or (r, g, b, a)
    rows = b""
    for y in range(h):
        rows += b"\x00" + b"".join(bytes((*pixel(x, y), 255)[:4]) for x in range(w))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    path.write_bytes(data)


def swatches(hull_color):
    colors = {**PALETTE, "hull": hull_color}

    def swatch(x, y):
        if 16 <= y < 24 and x < 8:
            return QUILT_LINE if QUILT[y - 16][x] == "L" else PALETTE["seat"]
        i = x // 4
        if y >= 4 or i >= len(NAMES):
            return (0, 0, 0)
        name = NAMES[i]
        return (*colors[name], ALPHA.get(name, 255))

    return swatch


ENTITY_TEXTURES.mkdir(parents=True, exist_ok=True)
for paint, hull_color in HULL_PAINTS.items():
    name = "sportsboat" if paint == "khaki" else f"sportsboat_{paint}"
    png(ENTITY_TEXTURES / f"{name}.png", TEXTURE_WIDTH, TEXTURE_HEIGHT, swatches(hull_color))

# Item icon: a 16-pixel side view, bow to the right, tower leaning forward, on transparency.
ICON = [
    "................",
    "................",
    "......KKKKKK....",
    ".....KKKKKKKK...",
    ".......F.F......",
    "......F.F.......",
    ".....F.F........",
    "....F.F...GGG...",
    ".TTF.F...GGGGG..",
    "HHHHHHHHHHHHHHHH",
    "SSSSSSSSSSSSSSSS",
    "HHHHHHHHHHHHHHH.",
    ".HHHHHHHHHHHHH..",
    "..HHHHHHHHHHH...",
    "................",
    "................",
]
ICON_COLORS = {"K": (44, 44, 48), "F": (70, 70, 76), "G": (170, 205, 225), "T": PALETTE["seat"],
               "H": (20, 20, 22), "S": PALETTE["trim"]}


def icon(x, y):
    return ICON_COLORS.get(ICON[y][x], (0, 0, 0, 0))


ITEM_TEXTURES.mkdir(parents=True, exist_ok=True)
png(ITEM_TEXTURES / "sportsboat_item.png", 16, 16, icon)
print("cubes:", len(body) + len(headlights) + len(glass))
