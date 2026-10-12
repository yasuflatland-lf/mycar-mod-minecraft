# Sports boat spike: findings

The spike was throwaway code on a local `spike/sportsboat` branch, built to decide how a second driven entity, a sports boat modelled on a 25-foot wake boat, floats, drives, and fits next to the SUV. Its code is not merged. This page is the record of what it measured and what the driver decided while trying it, and its appendix keeps the model generator the implementation starts from.

## Questions

1. Which floats better while driven: (A) gravity off with the script holding the draft, as the submarine floats (0040), or (B) the engine's `minecraft:buoyant` with the script driving only x and z?
2. Can a boat item be placed on water with the stable API?
3. What breaks when a second entity type joins the `vehicle` feature, which assumes one type (`VEHICLE_TYPE`)?
4. How do the seats, camera, lights, and handling feel?

Both hulls shared one box model (6 blocks long, no logo or model name) and a 2.2 × 1.2 collision box:

| Entity | Approach |
|---|---|
| `yasu_ride:sportsboat` | A: afloat, gravity off and the script pulls the feet to a 0.45-block draft (`clamp((depth - draft) * 0.3, ±0.08)`); horizontal motion is `stepFlightMotion` with a water medium (drag 0.83) |
| `yasu_ride:sportsboat_buoyant` | B: `minecraft:buoyant` (base 1.0, gravity on, no waves); the same horizontal motion, no vertical impulse |

Both coast to a stop with gravity on when no water is under them.

## Automated measurements (BDS in Docker, pool 3 blocks deep)

`bob` is the range of the feet height over the window; `draft` is the water surface minus the mean feet height.

| Test | A: script float | B: buoyant |
|---|---|---|
| Settling, first 40 ticks after `summon` at the surface | draft 0.46, bob 0.51 | draft 0.44, bob 0.63 |
| Unattended, next 60 ticks | draft 0.506, bob 0.000 | draft 0.454, bob 0.167 |
| Unattended, 200 ticks after that | draft 0.506, bob 0.000 | draft 0.456, bob 0.169 (never settles) |
| Full throttle, target 0.7 blocks/tick | 0.703, 31.0 blocks in 60 ticks | 0.774 (overshoots), 23.4 blocks |
| Full throttle, target 1.4 | 1.408, 62.0 blocks in 60 ticks | 1.022 |
| Full throttle, target 1.12 | not measured | 1.022 (unchanged: the engine, not the target, caps B) |
| Full right turn at speed, 30 ticks | 6.00°/tick (`SPEC.turnRate`), speed kept | 4.90°/tick, speed fell to 0.355 |
| Throttle released | stops within 40 ticks | stops within 40 ticks, bob 0.17 |
| Into a beach level with the water, and into a one-block bank | stops at the shore, stays afloat | same |
| Into a cow, ram reach 3.0 blocks | cow 10 → 0 hit with the bow 3.34 blocks from the center; boat 20 → 20 | cow 10 → 0 at 1.10, and at 0.31 at target 1.4; boat 20 → 20 |
| SUV in-game suite (24 tests) with the spike changes | 24/24 pass | |

## Manual test results (PC, 2026-10-12)

| Item | Result |
|---|---|
| Placing from the item | Works on water once the script climbs from the clicked block (often the bed) to the top water cell. The interaction ray skips liquids, and `getBlockFromViewDirection` returned nothing when the bed was clicked |
| Riding A and B | Both drive well; B's bob was not noticed. The driver chose B |
| Handling | Wanted faster turning, camera, and top speed. Top speed was set to 1.12 blocks/tick (0.7 doubled, then 0.8 of that); acceleration stays at the SUV's 0.0225 but is its own setting |
| Seat height | The first seats (0.75 above the feet) put the eye too high to see out. Lowered to 0.52 with the captain chairs 1 pixel lower; still to be confirmed |
| Paint and headlights | Dyes repaint the boat; the switch lights it |
| Breaking | Hitting the bow or stern did nothing: hits only land inside the 2.2-block square collision box. Three `minecraft:custom_hit_test` boxes along the hull were added; whether they fix breaking is still to be confirmed |
| Item icon | The SUV icon was confusing; a boat icon replaced it |
| Headlights | The driver asked for their own setting: 60 blocks ahead, two beams 3 blocks either side of the center line, cells 4 blocks apart |
| Ram | Wanted: mobs take damage, the boat and riders do not. Measured above |

## Findings

- **B was chosen** although A measured steadier: A holds its draft to the millimetre and follows the target speed; B bobs by 0.17 blocks, is capped near 1.02 blocks/tick by the engine whatever the target, and loses two thirds of its speed in a full turn. B needs a measured drag model before the target speed and turning mean anything.
- **Shores stop the boat.** With the feet about 0.45 below the land surface, a flush beach and a one-block bank both act as walls. The boat cannot leave the water by itself, and needs no beaching rule.
- **The collision box is square.** A 2.2-wide box under a 6-block hull lets the bow overlap a shore by 1.4 blocks and makes hits on the bow or stern miss. Ram reach must come from the hull, not from the SUV's `SPEC.bodyFront`.
- **Water under the feet.** A hull floating on the surface can have its feet above the water cell, so depth reads 0. A probe 0.3 blocks below the feet (`waterBelow`) tells afloat from beached.
- **One family query finds every vehicle.** `getEntities({ families: ["yasu_ride_vehicle"] })` replaced the per-type query; the SUV suite passed unchanged.
- **What assumes one entity type** (question 3):
  - Infrastructure: entity queries, the `entityLoad` / `entitySpawn` / hit / interact / riding filters, `protectedOccupant`, `spawnVehicle`, and `dropVehicleItem`, which drops an SUV item when a boat breaks. The fleet limit (one count across both types) and the starter item work unchanged.
  - Domain: the `Vehicle` aggregate runs the SUV's form machine, gear, and bank. The spike branched on the type inside the aggregate and reused the `submarine` / `car` forms as afloat / beached to switch gravity; the implementation must not. `SEAT_POSITIONS`, `DOOR_BY_SEAT`, `canPlaceAt`, `RAM_QUERY_RADIUS`, `headlightCells`, `updateSpeed`'s cap at `SPEC.maxSpeed`, and the body sizes in `SPEC` are SUV shapes. Driver lookup only worked because the boat's seats copied the SUV's x/z.
  - Paint: variant 0 is khaki for every entity; the boat's variant 0 texture is black.
  - Unit tests: the fakes need a family filter and the extra water probe.
- **Cube x rotations.** In game, a negative x rotation on a cube tips its +y toward +z before the model is turned 180 degrees; `tools/render_preview.py` draws x rotations the other way round. The tower struts, the helm display, and the jet bucket hoods depend on this.
- **Load.** The boat's beams put up to 30 light blocks each tick it moves with the lights on, against the SUV's 5.

## Requirements carried into the design

- Entity `yasu_ride:sportsboat` with `minecraft:buoyant` (base buoyancy 1.0, gravity on, no waves, water and flowing water), a 2.2 × 1.2 collision box, three hit boxes 2.2 × 1.4 centered 0.7 up at z −1.6, 0, and 1.6, four seats at the SUV's x/z and 0.52 up with seat 0 (front right) the driver, no doors, 16 paints with a black default, and the headlights property.
- Afloat when there is water at the feet or 0.3 below them; then the script drives x and z in water with gravity left on. Beached, it coasts to a stop. No forms, no third-person camera, no water breathing.
- Its own parameters, never the SUV's constants: top speed 1.12, acceleration 0.0225, reverse 0.2, turn rate 6°/tick, ram reach 3.0 ahead and 1.06 to each side, headlights 4 to 60 blocks ahead every 4 blocks in two beams 3 blocks either side.
- An item `yasu_ride:sportsboat_item` with a boat icon, placed on the water surface from the clicked block or the view ray, or on land.
- Breaking with three hits drops the boat item, not the SUV item. The fleet limit counts boats and SUVs together.
- The model in the appendix: black hull with a #616161 stripe, wraparound windshield raked back 55 degrees with a walk-through, a raked wake tower with a short soft top over the helm, tan seats with charcoal stripes and quilted centers, a teak floor, an open bow, a gray swim platform with a ladder, twin jet nozzles, and flush teardrop headlights on the bow flanks.

## Appendix: spike model generator

This is the spike's generator as it stood at the end, for the implementation to port to `tools/gen_sportsboat.py`. It also wrote the spike's entity, item, and client files, which the implementation writes by hand instead. Coordinates are pixels, forward +z and right +x, and the model is turned 180 degrees on export.

```python
"""SPIKE (spike/sportsboat): throwaway generator for a rough sports boat.

Writes a box model, 16 paint textures, and the entity, item, and client files for the two hulls under
comparison (sportsboat: script float, sportsboat_buoyant: minecraft:buoyant). No logo or model name.
Coordinates are pixels, forward +z and right +x, turned 180 degrees on export as gen_model.py does.
Run: python3 -I tools/spike_gen_boat.py
"""
import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BP = ROOT / "packs/yasu_ride_bp"
RP = ROOT / "packs/yasu_ride_rp"

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
    "steel": (205, 208, 212),  # stainless ladder
    "jet": (104, 106, 112),  # gray jet nozzles and reverse buckets
    "ring": (40, 92, 220),  # blue ring on the wheel hub
    "stripe": (0x61, 0x61, 0x61),  # the line along each side below the gunwale
}
ALPHA = {"glass": 80}
NAMES = list(PALETTE)
TEXTURE_WIDTH = 128
assert len(NAMES) * 4 <= TEXTURE_WIDTH
PAINTS = ["khaki", "green", "red", "white", "light_gray", "gray", "black", "orange", "yellow",
          "lime", "cyan", "light_blue", "blue", "purple", "magenta", "pink"]
HULL_PAINTS = {
    # SPIKE: variant 0 (khaki for the SUV) is black here, so a new boat is black.
    "khaki": (20, 20, 22), "green": (62, 96, 56), "red": (128, 22, 26), "white": (222, 222, 216),
    "light_gray": (156, 156, 152), "gray": (92, 94, 98), "black": (20, 20, 22), "orange": (190, 92, 28),
    "yellow": (214, 178, 44), "lime": (112, 160, 42), "cyan": (30, 118, 124), "light_blue": (92, 150, 204),
    "blue": (34, 70, 170), "purple": (94, 46, 128), "magenta": (160, 52, 140), "pink": (214, 132, 162),
}


def uv(color):
    i = NAMES.index(color)
    face = {"uv": [i * 4 + 1, 1], "uv_size": [2, 2]}
    return {k: dict(face) for k in ("north", "south", "east", "west", "up", "down")}


# A quilted tile below the swatch row: tan with a darker diamond lattice, stretched over a whole face.
QUILT_UV = {"uv": [0, 16], "uv_size": [8, 8]}
QUILT_LINE = (128, 80, 44)


def box(x0, y0, z0, x1, y1, z1, color, faces=None, **extra):
    """`faces` names the faces ("up", "south", ...) that get the quilted tile instead of the color."""
    face_uv = uv(color)
    for face in faces or ():
        face_uv[face] = dict(QUILT_UV)
    return {"origin": [x0, y0, z0], "size": [x1 - x0, y1 - y0, z1 - z0], "uv": face_uv, **extra}


def pair(x0, y0, z0, x1, y1, z1, color, **extra):
    """A box on the right (+x) and its mirror on the left."""
    return [box(x0, y0, z0, x1, y1, z1, color, **extra), box(-x1, y0, z0, -x0, y1, z1, color, **extra)]


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
        # U-shaped bow lounge along the sides: charcoal base, tan cushion and back
        inner = max(b - 7.5, 0.0)
        body += pair(inner, DECK_BOW, z, b - 1.6, DECK_BOW + 2.2, z + SLICE, "seat_dark")
        body += pair(inner, DECK_BOW + 2.2, z, b - 1.6, DECK_BOW + 3.2, z + SLICE, "seat")
        body += pair(b - 2.8, DECK_BOW + 3.2, z, b - 1.6, s - 0.6, z + SLICE, "seat")
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


# Helm (right, the driver is seat 0) and passenger buckets on pedestals: tan with charcoal backs
for sign in (1, -1):
    def mirror(x0, x1):
        return (x0, x1) if sign > 0 else (-x1, -x0)
    a, c = mirror(2.5, 10)
    body.append(box(a + 2.5, F, 3, c - 2.5, F + 0.5, 6, "metal"))  # pedestal
    body += striped(a, c, F + 0.5, F + 2.5, 1, 8, "up")  # cushion
    body.append(box(a, F + 2.5, 0, c, F + 9, 2, "seat_dark"))  # back
    body += striped(a + 0.6, c - 0.6, F + 3, F + 8.5, 1.9, 2.3, "south")  # face toward the sitter
    body.append(box(a - 0.5, F + 0.5, 0, a, F + 5, 8, "seat_dark"))  # bolsters
    body.append(box(c, F + 0.5, 0, c + 0.5, F + 5, 8, "seat_dark"))

# Mid benches either side of the aisle (seats 2 and 3), and the aft lounges facing forward
for x0, x1 in ((2.6, 15.4), (-15.4, -2.6)):
    body.append(box(x0, F, -17, x1, F + 2.6, -9, "seat_dark"))
    body += striped(x0, x1, F + 2.6, F + 3.6, -17, -9, "up")
    body += striped(x0, x1, F + 3.6, F + 9, -18.5, -17, "south")
    body.append(box(x0, F, -44, x1, F + 2.6, -27, "seat_dark"))
    body += striped(x0, x1, F + 2.6, F + 3.8, -42, -27, "up")
    body += striped(x0, x1, F + 3.8, F + 6.8, -44, -42, "south")
    body.append(box(x0, F + 3.8, -44, x1, F + 4.4, -42.4, "seat_dark"))  # charcoal band

# Helm console with a glossy dash, a big display, a wheel, and the throttle; passenger console
body.append(box(2, F, 9, 15.4, F + 7, 16, "gloss"))
body.append(box(2, F + 7, 10, 15.4, F + 8, 15.5, "gloss"))
body.append(box(-15.4, F, 9, -2, F + 6.5, 16, "gloss"))
body.append(box(-15.4, F + 6.5, 10, -2, F + 7.3, 15.5, "gloss"))
# The display sits right of the wheel's center, smaller than the dash is wide
SCREEN_PIVOT = [10.5, F + 8, 13.5]
body.append(box(7.2, F + 8, 13, 13.8, F + 11.8, 14, "gloss", pivot=SCREEN_PIVOT, rotation=[20, 0, 0]))
body.append(box(7.6, F + 8.4, 12.8, 13.4, F + 11.4, 13.1, "screen", pivot=SCREEN_PIVOT, rotation=[20, 0, 0]))
# Steering wheel as in the photo: a thick black rim, three broad black spokes at 10, 2, and 6 o'clock
# with chrome accents where they meet the rim, and a large hub with a blue ring and a silver center.
import math as _m
WHEEL = (6.25, F + 7.5, 8.2)
for i in range(16):
    ang = i * 22.5
    cx = WHEEL[0] + 2.7 * _m.cos(_m.radians(ang))
    cy = WHEEL[1] + 2.7 * _m.sin(_m.radians(ang))
    body.append(box(cx - 0.6, cy - 0.45, WHEEL[2], cx + 0.6, cy + 0.45, WHEEL[2] + 0.8, "gloss",
                    pivot=[cx, cy, WHEEL[2] + 0.4], rotation=[0, 0, ang + 90]))
for ang in (30, 150, 270):
    cx = WHEEL[0] + 1.5 * _m.cos(_m.radians(ang))
    cy = WHEEL[1] + 1.5 * _m.sin(_m.radians(ang))
    body.append(box(cx - 1.1, cy - 0.55, WHEEL[2] + 0.15, cx + 1.1, cy + 0.55, WHEEL[2] + 0.6, "gloss",
                    pivot=[cx, cy, WHEEL[2] + 0.4], rotation=[0, 0, ang]))
    ax = WHEEL[0] + 2.0 * _m.cos(_m.radians(ang))
    ay = WHEEL[1] + 2.0 * _m.sin(_m.radians(ang))
    body.append(box(ax - 0.35, ay - 0.35, WHEEL[2] + 0.05, ax + 0.35, ay + 0.35, WHEEL[2] + 0.15, "steel",
                    pivot=[ax, ay, WHEEL[2] + 0.1], rotation=[0, 0, ang]))
body.append(box(WHEEL[0] - 1.0, WHEEL[1] - 1.0, WHEEL[2] + 0.1, WHEEL[0] + 1.0, WHEEL[1] + 1.0, WHEEL[2] + 0.7, "gloss"))
body.append(box(WHEEL[0] - 0.75, WHEEL[1] - 0.75, WHEEL[2] - 0.0, WHEEL[0] + 0.75, WHEEL[1] + 0.75, WHEEL[2] + 0.1, "ring"))
body.append(box(WHEEL[0] - 0.45, WHEEL[1] - 0.45, WHEEL[2] - 0.05, WHEEL[0] + 0.45, WHEEL[1] + 0.45, WHEEL[2], "steel"))
body.append(box(5.75, F + 4, 8.8, 6.75, F + 7.5, 9.6, "gloss"))  # column
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


def glass_height(z):
    return max(0.0, min(lerp(WS_TOP, z), (FRONT_BASE - z) / RAKE))


z = -10.0
while z < FRONT_BASE:
    zc = z + SLICE / 2
    s, b, h = sheer(zc), beam(zc), glass_height(zc)
    if h > 0.3:
        glass.extend(pair(b - 1.5, s, z, b - 1.0, s + h, z + SLICE, "glass"))
        body += pair(b - 1.7, s + h, z, b - 0.8, s + h + 0.7, z + SLICE, "frame")  # top rail
    z += SLICE
s0 = sheer(FRONT_BASE)
rows = 9
for r in range(rows):
    y0 = s0 + r * WS_HEIGHT / rows
    zf = FRONT_BASE - r * (FRONT_BASE - FRONT_TOP) / rows
    hw = beam(zf) - 1.0
    # The center section is the walk-through to the bow
    glass.extend(pair(3.2, y0, zf - 0.9, hw, y0 + WS_HEIGHT / rows, zf, "glass"))
body += pair(3.0, s0 + WS_HEIGHT, FRONT_TOP - 1.0, beam(FRONT_TOP) - 1.0, s0 + WS_HEIGHT + 0.7, FRONT_TOP + 0.2, "frame")
# Walk-through posts lean back with the glass: one short block per row
for r in range(rows):
    y0 = s0 + r * WS_HEIGHT / rows
    zf = FRONT_BASE - r * (FRONT_BASE - FRONT_TOP) / rows
    body += pair(2.6, y0, zf - 0.9, 3.2, y0 + WS_HEIGHT / rows + 0.05, zf, "frame")
# Corner posts where the front meets the sides, and a mid post on each side pane
for r in range(rows):
    y0 = s0 + r * WS_HEIGHT / rows
    zf = FRONT_BASE - r * (FRONT_BASE - FRONT_TOP) / rows
    hw = beam(zf) - 1.0
    body += pair(hw - 0.6, y0, zf - 0.9, hw, y0 + WS_HEIGHT / rows + 0.05, zf, "frame")
body += pair(beam(6) - 1.6, sheer(6), 5.6, beam(6) - 1.0, sheer(6) + glass_height(6) + 0.2, 6.4, "frame")

# Wake tower: on each gunwale a raked rear and front strut with rungs and an X brace, then the top beam.
TX = 15.6  # inner face of the legs
TOWER_TOP = 32.5  # the bimini top then sits 1.97 blocks over the waterline: 8 ft 1 in at this scale


def strut(z0, y0, z1, y1, x0=TX, x1=TX + 1.6, t=1.6, color="frame"):
    dz, dy = z1 - z0, y1 - y0
    length = _m.hypot(dz, dy)
    # Lean the box from vertical toward +z. In game a negative x rotation does this, before the
    # 180-degree turn; render_preview.py draws cube x rotations the other way round.
    ang = _m.degrees(_m.atan2(dz, dy))
    return pair(x0, y0, z0 - t / 2, x1, y0 + length, z0 + t / 2, color,
                pivot=[(x0 + x1) / 2, y0, z0], rotation=[-ang, 0, 0])


# Raked about 50 degrees, so both struts meet under the middle of the short top over the helm.
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
B_FRONT, B_REAR = 9.0, -10.0  # half the earlier length, over the helm only
B_HALF = 19.0
B_TOP = TOWER_TOP + 3.5
B_THICK = 2.0
z = B_REAR
while z < B_FRONT:
    zc = z + SLICE / 2
    front = B_FRONT - zc
    rear = zc - B_REAR
    drop = 2.4 if front < 1.5 else 1.2 if front < 3.5 else 0.0
    corner = 2.0 if min(front, rear) < 1.5 else 0.8 if min(front, rear) < 3.5 else 0.0
    hw = B_HALF - corner
    t = rear / (B_FRONT - B_REAR)
    top = B_TOP - drop - 1.5 * t + 0.6 * (1 - (2 * t - 1) ** 2)
    body.append(box(-hw + 3, top - B_THICK, z, hw - 3, top, z + SLICE, "canvas"))
    if B_REAR + 4 <= z and z + SLICE <= B_FRONT - 4:
        body.append(box(-9, top, z, 9, top + 0.25, z + SLICE, "canvas_panel"))
    body += pair(hw - 3, top - B_THICK - 0.8, z, hw - 1, top - 0.3, z + SLICE, "canvas")
    body += pair(hw - 1, top - B_THICK - 1.6, z, hw, top - 1.0, z + SLICE, "canvas")
    z += SLICE

# Tower speakers under the front corners of the top beam
for x in (-11, 7):
    body.append(box(x, TOWER_TOP - 2.6, 1.0, x + 4, TOWER_TOP, 4.0, "gloss"))
    body.append(box(x + 0.6, TOWER_TOP - 2.2, 4.0, x + 3.4, TOWER_TOP - 0.4, 4.3, "metal"))
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
    next_b = beam(zl + SLICE * 1.5)
    if zl + SLICE < LAMP[1]:
        headlights += pair(next_b, yc - h / 2, zl + SLICE - 0.15, hull_b + 0.15, yc + h / 2, zl + SLICE, "light")
    zl += SLICE

geo = {
    "format_version": "1.12.0",
    "minecraft:geometry": [{
        "description": {
            "identifier": "geometry.yasu_ride.sportsboat",
            "texture_width": TEXTURE_WIDTH, "texture_height": 32,
            "visible_bounds_width": 8, "visible_bounds_height": 4, "visible_bounds_offset": [0, 1.5, 0],
        },
        "bones": [
            {"name": "root", "pivot": [0, 12, 0]},
            {"name": "body", "parent": "root", "pivot": [0, 7, 0], "cubes": body},
            {"name": "headlights", "parent": "body", "pivot": [0, 7, 0], "cubes": headlights},
            {"name": "windshield", "parent": "body", "pivot": [0, 7, 0], "cubes": glass},
        ],
    }],
}


def turn_around(bones):
    for bone in bones:
        if "pivot" in bone:
            bone["pivot"] = [-bone["pivot"][0], bone["pivot"][1], -bone["pivot"][2]]
        for cube in bone.get("cubes", []):
            (x, y, z), (w, h, d) = cube["origin"], cube["size"]
            cube["origin"] = [-(x + w), y, -(z + d)]
            if "pivot" in cube:
                cube["pivot"] = [-cube["pivot"][0], cube["pivot"][1], -cube["pivot"][2]]
            if "rotation" in cube:
                rx, ry, rz = cube["rotation"]
                cube["rotation"] = [-rx, ry, -rz]
            # Turning around swaps which way each face points; quilted faces must follow
            f = cube["uv"]
            f["north"], f["south"], f["east"], f["west"] = f["south"], f["north"], f["west"], f["east"]


def png(path, w, h, pixel):
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
            u, v = x, y - 16
            lattice = (u + v) % 4 == 0 or (u - v) % 4 == 0
            return (*(QUILT_LINE if lattice else PALETTE["seat"]), 255)
        i = x // 4
        if y >= 4 or i >= len(NAMES):
            return (0, 0, 0)
        name = NAMES[i]
        return (*colors[name], ALPHA.get(name, 255))
    return swatch


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


turn_around(geo["minecraft:geometry"][0]["bones"])
write_json(RP / "models/entity/yasu_ride/sportsboat.geo.json", geo)
tex_dir = RP / "textures/entity/yasu_ride"
for paint in PAINTS:
    png(tex_dir / f"sportsboat_{paint}.png", TEXTURE_WIDTH, 32, swatches(HULL_PAINTS[paint]))

suv = json.loads((BP / "entities/yasu_ride/suv.se.json").read_text())
for name, buoyant in (("sportsboat", False), ("sportsboat_buoyant", True)):
    ent = json.loads(json.dumps(suv))
    e = ent["minecraft:entity"]
    e["description"]["identifier"] = f"yasu_ride:{name}"
    c = e["components"]
    c["minecraft:collision_box"] = {"width": 2.2, "height": 1.2}
    # Same local x/z as the SUV seats, so the driver lookup (seats.ts) still finds seat 0.
    seats = c["minecraft:rideable"]["seats"]
    for seat in seats:
        # The rider's hips sit about 0.22 above the seat point (as on the SUV), so this puts them on
        # the captain chairs' cushions, 0.74 blocks up.
        seat["position"][1] = 0.52
    # The square collision box covers only the middle 2.2 blocks of the 5-block hull, so hits on the
    # bow or stern missed it. Three hit boxes along the hull cover its length.
    c["minecraft:custom_hit_test"] = {"hitboxes": [
        {"pivot": [0, 0.7, z], "width": 2.2, "height": 1.4} for z in (-1.6, 0.0, 1.6)
    ]}
    if buoyant:
        c["minecraft:buoyant"] = {
            "base_buoyancy": 1.0,
            "apply_gravity": True,
            "simulate_waves": False,
            "big_wave_probability": 0.0,
            "liquid_blocks": ["minecraft:water", "minecraft:flowing_water"],
        }
    write_json(BP / f"entities/yasu_ride/{name}.se.json", ent)

    write_json(BP / f"items/yasu_ride/{name}_item.item.json", {
        "format_version": "1.21.80",
        "minecraft:item": {
            "description": {"identifier": f"yasu_ride:{name}_item", "menu_category": {"category": "items"}},
            "components": {
                "minecraft:icon": "yasu_ride_sportsboat_item",
                "minecraft:max_stack_size": 1,
                # Without a use behavior a tap on the water never reaches itemUse (ADR 0024).
                "minecraft:use_modifiers": {"use_duration": 0.1, "movement_modifier": 1.0},
                "minecraft:display_name": {"value": f"item.yasu_ride:{name}_item.name"},
            },
        },
    })

    write_json(RP / f"entity/yasu_ride/{name}.ce.json", {
        "format_version": "1.10.0",
        "minecraft:client_entity": {
            "description": {
                "identifier": f"yasu_ride:{name}",
                "materials": {"default": "entity", "lamp": "entity", "lamp_lit": "entity_emissive",
                              "glass": "entity_alphablend"},
                "textures": {p: f"textures/entity/yasu_ride/sportsboat_{p}" for p in PAINTS},
                "geometry": {"default": "geometry.yasu_ride.sportsboat"},
                "render_controllers": ["controller.render.yasu_ride.sportsboat"],
            },
        },
    })

write_json(RP / "render_controllers/yasu_ride/sportsboat.rc.json", {
    "format_version": "1.8.0",
    "render_controllers": {
        "controller.render.yasu_ride.sportsboat": {
            "arrays": {
                "textures": {"Array.paints": [f"Texture.{p}" for p in PAINTS]},
                "materials": {"Array.lamps": ["Material.lamp", "Material.lamp_lit"]},
            },
            "geometry": "Geometry.default",
            "materials": [
                {"*": "Material.default"},
                {"headlights": "Array.lamps[query.property('yasu_ride:headlights') ? 1 : 0]"},
                {"windshield": "Material.glass"},
            ],
            "textures": ["Array.paints[query.variant]"],
        }
    },
})

# Item icon: hand-drawn 16-pixel side view, bow to the right, tower leaning forward, on transparency.
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


def icon_pixel(px, py):
    c = ICON[py][px]
    return (*ICON_COLORS[c], 255) if c in ICON_COLORS else (0, 0, 0, 0)


png(RP / "textures/items/yasu_ride/sportsboat_item.png", 16, 16, icon_pixel)
atlas_path = RP / "textures/item_texture.json"
atlas = json.loads(atlas_path.read_text())
atlas["texture_data"]["yasu_ride_sportsboat_item"] = {"textures": "textures/items/yasu_ride/sportsboat_item"}
write_json(atlas_path, atlas)
print("cubes:", len(body) + len(headlights) + len(glass))
```
