"""Generate the model and textures for the MyCar SUV.

Coordinates are in pixels (16 px = 1 block). The definitions below use "forward +z, left +x",
and are rotated 180° around the Y axis just before writing, because in Bedrock the front of an
entity is on the -z side of the model.
Bone names follow the convention: root / body / wheel_fl / wheel_fr / wheel_rl / wheel_rr / seat_0..3.
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
}
NAMES = list(PALETTE)


def uv(color):
    i = NAMES.index(color)
    face = {"uv": [i * 4 + 1, 1], "uv_size": [2, 2]}
    return {k: dict(face) for k in ("north", "south", "east", "west", "up", "down")}


def box(x0, y0, z0, x1, y1, z1, color):
    return {"origin": [x0, y0, z0], "size": [x1 - x0, y1 - y0, z1 - z0], "uv": uv(color)}


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
    # Rear spare tire
    box(-5, 9, -29, 5, 19, -26, "tire"),
    box(-2, 12, -29.3, 2, 16, -29, "rim"),
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

# Steering wheel (+x side; shown in game as right-hand drive). Small blocks arranged on a circle make it
# look round, tilted 20° toward the driver. Light gray so it does not get lost in the dark interior
WHEEL_CENTER = (6.0, 16.5)  # (x, y)
WHEEL_PIVOT = [WHEEL_CENTER[0], WHEEL_CENTER[1], 9.5]
WHEEL_RADIUS = 2.4


def tilted(cube):
    cube["pivot"] = WHEEL_PIVOT
    cube["rotation"] = [-20, 0, 0]
    return cube


def small(cx, cy, w, h, color, z0=9.0, z1=9.8):
    return tilted(box(cx - w / 2, cy - h / 2, z0, cx + w / 2, cy + h / 2, z1, color))


cx, cy = WHEEL_CENTER
steering = [
    small(cx + WHEEL_RADIUS * math.cos(math.radians(a)), cy + WHEEL_RADIUS * math.sin(math.radians(a)), 1.0, 1.0, "rim")
    for a in range(0, 360, 30)
]
steering += [
    small(cx, cy, 1.4, 1.4, "trim", 9.1, 9.9),  # hub
    small(cx - 1.2, cy, 1.2, 0.5, "rim"),  # spoke (right)
    small(cx + 1.2, cy, 1.2, 0.5, "rim"),  # spoke (left)
    small(cx, cy - 1.2, 0.5, 1.2, "rim"),  # spoke (bottom)
    small(cx, cy, 0.8, 0.8, "trim", 9.9, 11.0),  # column
]
body += steering

FRONT = 25  # z of the hood's front face


def round_lamp(cx, cy, r, ring, lens, z0, z1):
    """Make a round-looking lamp from a rim of small blocks on a circle plus a cross-shaped lens."""
    cubes = [
        box(cx + r * math.cos(math.radians(a)) - 0.5, cy + r * math.sin(math.radians(a)) - 0.5, z0,
            cx + r * math.cos(math.radians(a)) + 0.5, cy + r * math.sin(math.radians(a)) + 0.5, z1, ring)
        for a in range(0, 360, 30)
    ]
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
    body += [box(11.0 * side - 1, 4, 28, 11.0 * side + 1, 6, 28.2, "light")]

# Gauges (behind the steering wheel, on the driver's side of the dashboard). Two round dials + red needles
body += [
    box(2.5, 16.8, 10, 9.5, 19.8, 10.6, "grille"),  # gauge bezel
    box(3, 17.2, 9.9, 5.6, 19.4, 10, "gauge"),  # speedometer
    box(6.4, 17.2, 9.9, 9, 19.4, 10, "gauge"),  # tachometer
    box(4.2, 18.0, 9.8, 4.4, 19.2, 9.9, "tail"),  # needle
    box(7.6, 18.0, 9.8, 7.8, 19.2, 9.9, "tail"),  # needle
]

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


def wheel(name, x_out, z_center):
    # x_out: sign pointing outward (+1 = left, -1 = right)
    x0, x1 = (12, 16) if x_out > 0 else (-16, -12)
    hub_x0, hub_x1 = (16, 16.5) if x_out > 0 else (-16.5, -16)
    return {
        "name": name,
        "parent": "root",
        "pivot": [14 * x_out, 6, z_center],
        "cubes": [
            box(x0, 0, z_center - 6, x1, 12, z_center + 6, "tire"),
            box(hub_x0, 3, z_center - 3, hub_x1, 9, z_center + 3, "rim"),
            box(hub_x0, 5, z_center - 5, hub_x1, 7, z_center + 5, "rim"),
        ],
    }


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
                wheel("wheel_fl", +1, 17),
                wheel("wheel_fr", -1, 17),
                wheel("wheel_rl", +1, -16),
                wheel("wheel_rr", -1, -16),
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
        rows += b"\x00" + b"".join(bytes(pixel(x, y)) + b"\xff" for x in range(w))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    path.write_bytes(data)


def pixel_for(body_color):
    def f(x, y):
        i = x // 4
        if y >= 4 or i >= len(NAMES):
            return (0, 0, 0)
        name = NAMES[i]
        return body_color if name == "body" else PALETTE[name]

    return f


(RP / "textures/entity").mkdir(parents=True, exist_ok=True)
(RP / "textures/items").mkdir(parents=True, exist_ok=True)
png(RP / "textures/entity/suv.png", 64, 16, pixel_for(PALETTE["body"]))


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
print("cubes:", sum(len(b.get("cubes", [])) for b in geo["minecraft:geometry"][0]["bones"]))
