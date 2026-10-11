"""Generate the model and textures for the MyCar SUV.

Coordinates are in pixels (16 px = 1 block). The definitions below use "forward +z, right +x",
and are rotated 180° around the Y axis just before writing, because in Bedrock the front of an
entity is on the -z side of the model.
Bone names follow the convention (ADR 0009): root / body / wheel_fl / wheel_fr / wheel_rl / wheel_rr /
door_fr / door_rr / door_fl / door_rl / seat_0..3.
"""
import json
import math
import struct
import sys
import zlib
from pathlib import Path

RP = Path(sys.argv[1])
(RP / "models/entity").mkdir(parents=True, exist_ok=True)

# Color swatches. Each color fills a 4x4 cell, and each face's UV points at the cell's center 2x2
PALETTE = {
    "body": (142, 128, 88),  # khaki
    "trim": (58, 58, 60),
    "grille": (14, 14, 14),
    "tire": (20, 20, 20),
    "rim": (176, 176, 180),
    "seat": (45, 43, 42),
    "light": (232, 232, 208),
    "tail": (170, 30, 30),
    "glass": (40, 52, 60),
    "gauge": (225, 225, 215),
    "amber": (235, 150, 30),
    "leather": (110, 68, 38),
    "spoke": (97, 97, 97),  # #616161
}
NAMES = list(PALETTE)
EMISSIVE = {"light"}

# Body color of each paint (ADR 0017). Khaki writes suv.png; the others write suv_<paint>.png.
# The red stays darker than the "tail" swatch so the tail lights still show on a red body.
BODY_PAINTS = {
    "khaki": PALETTE["body"],
    "green": (62, 96, 56),
    "red": (128, 22, 26),
}


def uv(color):
    i = NAMES.index(color)
    face = {"uv": [i * 4 + 1, 1], "uv_size": [2, 2]}
    return {k: dict(face) for k in ("north", "south", "east", "west", "up", "down")}


def box(x0, y0, z0, x1, y1, z1, color):
    return {"origin": [x0, y0, z0], "size": [x1 - x0, y1 - y0, z1 - z0], "uv": uv(color)}


def disc(axis, center, half, a0, a1, angles, color):
    """Squares turned by each angle around the axle; together they read as a polygon of len(angles) * 4 sides."""
    cubes = []
    for angle in angles:
        if axis == "x":
            cube = box(a0, center[1] - half, center[2] - half, a1, center[1] + half, center[2] + half, color)
            cube["rotation"] = [angle, 0, 0]
        else:
            cube = box(center[0] - half, center[1] - half, a0, center[0] + half, center[1] + half, a1, color)
            cube["rotation"] = [0, 0, angle]
        cube["pivot"] = list(center)
        cubes.append(cube)
    return cubes


body = [
    # Chassis and floor
    box(-13, 4, -24, 13, 7, 24, "trim"),
    # Hood (engine compartment)
    box(-13, 7, 13, 13, 17, 25, "body"),
    # Front bumper
    box(-15, 3, 25, 15, 7, 28, "trim"),
    # Dashboard
    box(-12, 13, 10, 12, 17, 13, "trim"),
    # Windshield lower frame and A-pillars
    box(-12, 17, 12.5, 12, 18, 13, "trim"),
    box(-13, 17, 12, -12, 30, 13, "body"),
    box(12, 17, 12, 13, 30, 13, "body"),
    # Rearview mirror (center of the windshield's top edge)
    box(-0.5, 27, 11.5, 0.5, 29, 12, "trim"),
    box(-2.5, 25.5, 11, 2.5, 27, 11.5, "rim"),
    # Side mirrors (at the front edge of the doors, sticking out at window height)
    box(13, 17, 10, 14, 18, 11, "body"),
    box(14, 16.5, 9.5, 16.5, 19.5, 11, "body"),
    box(14.2, 17, 9.3, 16.3, 19, 9.5, "rim"),
    box(-14, 17, 10, -13, 18, 11, "body"),
    box(-16.5, 16.5, 9.5, -14, 19.5, 11, "body"),
    box(-16.3, 17, 9.3, -14.2, 19, 9.5, "rim"),
    # Roof
    box(-13, 29, -25, 13, 30, 13, "body"),
    # B-pillars / C-pillars (left and right)
    box(12, 17, -6, 13, 29, -5, "body"),
    box(-13, 17, -6, -12, 29, -5, "body"),
    box(12, 7, -25, 13, 29, -22, "body"),
    box(-13, 7, -25, -12, 29, -22, "body"),
    # Rear (tailgate + upper frame)
    box(-13, 7, -26, 13, 17, -25, "body"),
    box(-13, 27, -26, 13, 29, -25, "body"),
    box(12, 9, -26.2, 13, 13, -25.8, "tail"),
    box(-13, 9, -26.2, -12, 13, -25.8, "tail"),
    # Exhaust pipe (rear right = +x side, sticking out backward from under the bumper)
    box(8, 3.5, -28, 10, 5.5, -22, "trim"),
    box(7.75, 3.25, -28.5, 10.25, 5.75, -28, "rim"),
    # Fenders (fender flares)
    box(13, 12, 10, 16, 14, 24, "trim"),
    box(-16, 12, 10, -13, 14, 24, "trim"),
    box(13, 12, -23, 16, 14, -9, "trim"),
    box(-16, 12, -23, -13, 14, -9, "trim"),
    # Side steps
    box(13, 4, -9, 15, 6, 10, "trim"),
    box(-15, 4, -9, -13, 6, 10, "trim"),
    # Seats (2 in front + a rear bench)
    box(2, 7, 1, 11, 10, 9, "seat"),
    box(2, 10, 0, 11, 19, 1, "seat"),
    box(-11, 7, 1, -2, 10, 9, "seat"),
    box(-11, 10, 0, -2, 19, 1, "seat"),
    box(-11, 7, -17, 11, 10, -9, "seat"),
    box(-11, 10, -18, 11, 19, -17, "seat"),
]

# Steering wheel (+x side; shown in game as right-hand drive), tilted 20° toward the driver. Like the
# tires, the rim is a ring of thin blocks turned around the column. Brown leather rim, gray spokes,
# and a black hub and column
WHEEL_CENTER = (6.0, 16.5)  # (x, y)
WHEEL_PIVOT = [WHEEL_CENTER[0], WHEEL_CENTER[1], 9.5]
WHEEL_RADIUS = 2.4
WHEEL_TILT = -20


def tilted_spin(spin):
    """Euler angles for "turn by spin around z, then tilt around x".

    A cube applies its x rotation first and z last, so a tilted, spun block needs all three angles.
    """
    st, ct = math.sin(math.radians(WHEEL_TILT)), math.cos(math.radians(WHEEL_TILT))
    sz, cz = math.sin(math.radians(spin)), math.cos(math.radians(spin))
    # M = Rx(tilt) @ Rz(spin), decomposed as Rz(c) @ Ry(b) @ Rx(a)
    m00, m10 = cz, ct * sz
    m20, m21, m22 = st * sz, st * cz, ct
    b = math.asin(-m20)
    a = math.atan2(m21, m22)
    c = math.atan2(m10, m00)
    return [round(math.degrees(v), 3) for v in (a, b, c)]


def steering_part(x0, y0, x1, y1, color, z0=9.0, z1=9.8, spin=0):
    cube = box(x0, y0, z0, x1, y1, z1, color)
    cube["pivot"] = WHEEL_PIVOT
    cube["rotation"] = tilted_spin(spin)
    return cube


def small(cx, cy, w, h, color, z0=9.0, z1=9.8):
    return steering_part(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, color, z0, z1)


cx, cy = WHEEL_CENTER
RIM_SEGMENTS, RIM_WIDTH = 16, 0.7
rim_half_chord = round(WHEEL_RADIUS * math.tan(math.radians(180 / RIM_SEGMENTS)) + 0.05, 3)
steering = [
    steering_part(
        cx - rim_half_chord, cy + WHEEL_RADIUS - RIM_WIDTH / 2, cx + rim_half_chord, cy + WHEEL_RADIUS + RIM_WIDTH / 2,
        "leather", spin=i * 360 / RIM_SEGMENTS,
    )
    for i in range(RIM_SEGMENTS)
]
steering += [steering_part(cx - 0.7, cy - 0.7, cx + 0.7, cy + 0.7, "grille", 9.1, 9.9, spin) for spin in (0, 45)]  # hub
steering += [
    small(cx - 1.2, cy, 1.2, 0.5, "spoke"),  # spoke (left)
    small(cx + 1.2, cy, 1.2, 0.5, "spoke"),  # spoke (right)
    small(cx, cy - 1.2, 0.5, 1.2, "spoke"),  # spoke (bottom)
    small(cx, cy, 0.8, 0.8, "grille", 9.9, 11.0),  # column
]
body += steering

FRONT = 25  # z of the hood's front face


def round_lamp(cx, cy, r, ring, lens, z0, z1):
    """Make a round-looking lamp from a rim of small blocks on a circle plus a cross-shaped lens."""
    cubes = []
    for a in range(0, 360, 30):
        x = cx + r * math.cos(math.radians(a))
        y = cy + r * math.sin(math.radians(a))
        cubes.append(box(x - 0.5, y - 0.5, z0, x + 0.5, y + 0.5, z1, ring))
    k = r * 0.75
    cubes += [
        box(cx - k, cy - k * 0.55, z0, cx + k, cy + k * 0.55, z1 + 0.05, lens),
        box(cx - k * 0.55, cy - k, z0, cx + k * 0.55, cy + k, z1 + 0.05, lens),
    ]
    return cubes


# Round headlights (left and right)
for side in (+1, -1):
    body += round_lamp(10.3 * side, 12.3, 2.3, "trim", "light", FRONT, FRONT + 0.6)

# Vertical-slot grille: body-colored bars over a black back panel, so the gaps look like black slots
SLOTS, SLOT_W, BAR_W = 8, 1.1, 0.6
grille_w = SLOTS * SLOT_W + (SLOTS + 1) * BAR_W
gx0 = -grille_w / 2
body += [
    box(gx0, 8.5, FRONT, -gx0, 16.5, FRONT + 0.2, "grille"),  # back panel
    box(gx0 - 0.5, 16.5, FRONT, -gx0 + 0.5, 17, FRONT + 0.6, "body"),  # top frame
    box(gx0 - 0.5, 8, FRONT, -gx0 + 0.5, 8.5, FRONT + 0.6, "body"),  # bottom frame
]
for i in range(SLOTS + 1):
    x = gx0 + i * (SLOT_W + BAR_W)
    body.append(box(x, 8.5, FRONT + 0.2, x + BAR_W, 16.5, FRONT + 0.6, "body"))

# Turn signals (front fender corners, amber)
for side in (+1, -1):
    x0, x1 = sorted((13.5 * side, 15.5 * side))
    body.append(box(x0, 12.2, 24, x1, 13.8, 24.3, "amber"))

# Fog lamps (lower left and right of the bumper)
for side in (+1, -1):
    body.append(box(11.0 * side - 1, 4, 28, 11.0 * side + 1, 6, 28.2, "light"))

def round_face(center, radius, z0, z1, color, segments=12):
    """A flat round face (facing -z) made of thin blocks reaching out from the center like clock hands.

    Turned squares would leave their corners poking out like a gear; these blocks only overhang the
    circle by a few percent at their outer corners.
    """
    cx, cy, _ = center
    half_chord = radius * math.tan(math.radians(180 / segments))
    cubes = []
    for i in range(segments):
        cube = box(cx - half_chord, cy, z0, cx + half_chord, cy + radius, z1, color)
        cube["pivot"] = list(center)
        cube["rotation"] = [0, 0, round(i * 360 / segments, 3)]
        cubes.append(cube)
    return cubes


# Gauges (behind the steering wheel, on the driver's side of the dashboard). Two round dials with red
# needles, each in a round black bezel
for dial_x in (4.3, 7.7):  # speedometer, tachometer
    center = (dial_x, 18.3, 10)
    body += round_face(center, 1.6, 10, 10.6, "grille")  # bezel
    body += round_face(center, 1.25, 9.9, 10, "gauge")  # dial
    body.append(box(dial_x - 0.1, 18.3, 9.8, dial_x + 0.1, 19.3, 9.9, "tail"))  # needle

# Center console and shift lever (between the front seats)
body += [
    box(-1.5, 7, 1, 1.5, 11, 10, "trim"),  # console
    box(-0.75, 11, 5, 0.75, 11.5, 6.5, "grille"),  # boot
    box(-0.25, 11.5, 5.5, 0.25, 14, 6, "rim"),  # lever
    box(-0.75, 14, 5.25, 0.75, 15, 6.25, "grille"),  # knob
]


# Doors (ADR 0009). The +x side of this definition becomes the right side in game. The pivot sits on the hinge (front edge)
DOORS = {
    "door_fr": (+1, 12, -5),  # (side, front-edge z, rear-edge z)
    "door_rr": (+1, -6, -22),
    "door_fl": (-1, 12, -5),
    "door_rl": (-1, -6, -22),
}


def door(name):
    side, z_front, z_back = DOORS[name]
    x0, x1 = (12, 13) if side > 0 else (-13, -12)
    return {
        "name": name,
        "parent": "body",
        "pivot": [12.5 * side, 12, z_front],
        "cubes": [box(x0, 7, z_back, x1, 17, z_front, "body")],
    }


def round_tire(axis, center, radius, a0, a1, segments=16):
    """A tire whose tread is a ring of thin blocks turned around the axle, like a voxel-art wheel.

    axis is the axle direction ("x" for road wheels, "z" for the spare); a0..a1 is the tire's span along it.
    """
    step = 360 / segments
    # Half a chord, rounded up a little so neighboring tread blocks overlap instead of leaving gaps
    half_chord = round(radius * math.tan(math.radians(step / 2)) + 0.1, 3)
    tread = 1.4
    cubes = []
    for i in range(segments):
        cx, cy, cz = center
        if axis == "x":
            cube = box(a0, cy + radius - tread, cz - half_chord, a1, cy + radius, cz + half_chord, "tire")
            cube["rotation"] = [i * step, 0, 0]
        else:
            cube = box(cx - half_chord, cy + radius - tread, a0, cx + half_chord, cy + radius, a1, "tire")
            cube["rotation"] = [0, 0, i * step]
        cube["pivot"] = list(center)
        cubes.append(cube)
    # Sidewall filling the inside of the tread, inset slightly so the tread edge stands out
    cubes += disc(axis, center, radius - 1.2, a0 + 0.2, a1 - 0.2, (0, 30, 60), "tire")
    return cubes


def wheel(name, x_out, z_center):
    # x_out: sign pointing outward (+1 = right, -1 = left)
    x0, x1 = (12, 16) if x_out > 0 else (-16, -12)
    rim_x0, rim_x1 = (15.9, 16.2) if x_out > 0 else (-16.2, -15.9)
    hub_x0, hub_x1 = (16.2, 16.5) if x_out > 0 else (-16.5, -16.2)
    center = (14 * x_out, 6, z_center)
    return {
        "name": name,
        "parent": "root",
        "pivot": list(center),
        "cubes": [
            *round_tire("x", center, 6, x0, x1),
            *disc("x", center, 2.8, rim_x0, rim_x1, (0, 30, 60), "rim"),
            *disc("x", center, 1.1, hub_x0, hub_x1, (0, 45), "trim"),
        ],
    }


# Rear spare tire (on the tailgate, axle along z)
SPARE = (0, 14, -27.5)
body += round_tire("z", SPARE, 5, -29, -26)
body += disc("z", SPARE, 2.3, -29.3, -29, (0, 30, 60), "rim")
body += disc("z", SPARE, 0.9, -29.5, -29.3, (0, 45), "trim")


# Lamp lenses (the "light" swatch: headlights and fog lamps) get a bone of their own, so the render
# controller can give them a glowing material while the headlights are on (ADR 0020)
LIGHT_UV = uv("light")
headlights = [c for c in body if c["uv"] == LIGHT_UV]
body = [c for c in body if c["uv"] != LIGHT_UV]

geo = {
    "format_version": "1.12.0",
    "minecraft:geometry": [
        {
            "description": {
                "identifier": "geometry.mycar.suv",
                "texture_width": 64,
                "texture_height": 16,
                "visible_bounds_width": 5,
                "visible_bounds_height": 3,
                "visible_bounds_offset": [0, 1, 0],
            },
            "bones": [
                {"name": "root", "pivot": [0, 0, 0]},
                {"name": "body", "parent": "root", "pivot": [0, 7, 0], "cubes": body,
                 "locators": {"exhaust": [9, 4.5, -28.6]}},
                {"name": "headlights", "parent": "body", "pivot": [0, 7, 0], "cubes": headlights},
                wheel("wheel_fl", -1, 17),
                wheel("wheel_fr", +1, 17),
                wheel("wheel_rl", -1, -16),
                wheel("wheel_rr", +1, -16),
                *[door(n) for n in DOORS],
                {"name": "seat_0", "parent": "body", "pivot": [6, 10, 2]},
                {"name": "seat_1", "parent": "body", "pivot": [-6, 10, 2]},
                {"name": "seat_2", "parent": "body", "pivot": [6, 10, -17]},
                {"name": "seat_3", "parent": "body", "pivot": [-6, 10, -17]},
            ],
        }
    ],
}


def turn_around(bones):
    """Rotate 180° around the Y axis (negate x and z)."""
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
                cube["rotation"] = [-rx, ry, -rz]
            # Face directions also swap (north <-> south, east <-> west). The faces are solid colors, so the UVs can stay as they are


turn_around(geo["minecraft:geometry"][0]["bones"])
(RP / "models/entity/suv.geo.json").write_text(json.dumps(geo, indent=1))


def png(path, w, h, pixel):
    rows = b""
    for y in range(h):
        rows += b"\x00" + b"".join(bytes((*pixel(x, y), 255)[:4]) for x in range(w))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    path.write_bytes(data)


def swatches(body_color):
    colors = {**PALETTE, "body": body_color}

    def swatch(x, y):
        i = x // 4
        if y >= 4 or i >= len(NAMES):
            return (0, 0, 0)
        # Alpha 0 marks the swatch as emissive for the entity_emissive material; the materials the
        # lenses use while the headlights are off ignore alpha (ADR 0020)
        return (*colors[NAMES[i]], 0) if NAMES[i] in EMISSIVE else colors[NAMES[i]]

    return swatch


(RP / "textures/entity").mkdir(parents=True, exist_ok=True)
(RP / "textures/items").mkdir(parents=True, exist_ok=True)
for paint, body_color in BODY_PAINTS.items():
    name = "suv" if paint == "khaki" else f"suv_{paint}"
    png(RP / f"textures/entity/{name}.png", 64, 16, swatches(body_color))


def icon(x, y):
    # 16x16 icon: khaki body and black tires
    if 9 <= y <= 12 and (3 <= x <= 5 or 10 <= x <= 12):
        return PALETTE["tire"]
    if 4 <= y <= 9 and 1 <= x <= 14:
        return PALETTE["body"]
    if 1 <= y <= 3 and 4 <= x <= 11:
        return PALETTE["glass"]
    return (0, 0, 0)


png(RP / "textures/items/suv_item.png", 16, 16, icon)


def switch_icon(x, y):
    # 16x16 headlight switch icon: a glowing round lamp on a dark switch plate
    if (x - 7.5) ** 2 + (y - 6.5) ** 2 <= 16:
        return PALETTE["light"]
    if 3 <= x <= 12 and 11 <= y <= 14:
        return PALETTE["trim"]
    return (0, 0, 0, 0)


png(RP / "textures/items/headlight_switch.png", 16, 16, switch_icon)
print("cubes:", sum(len(b.get("cubes", [])) for b in geo["minecraft:geometry"][0]["bones"]))
