"""Generate the model and textures for the Yasuflatland Ride SUV.

Coordinates are in pixels (16 px = 1 block). The definitions below use "forward +z, right +x",
and are rotated 180° around the Y axis just before writing, because in Bedrock the front of an
entity is on the -z side of the model.
Bone names follow the convention (ADR 0009, 0022, 0043): root / body / wheel_fl / wheel_fr / wheel_rl /
wheel_rr / glow_fl / glow_fr / glow_rl / glow_rr / rear_glass / windows_sealed / prop_rl / prop_rr /
arm_fl / arm_fr / arm_rl / arm_rr / sub_arm_rl / sub_arm_rr / door_fr / door_rr / door_fl / door_rl / seat_0..3.
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
MODELS.mkdir(parents=True, exist_ok=True)

# Color swatches. Each color fills a 4x4 cell, and each face's UV points at the cell's center 2x2
PALETTE = {
    "body": (142, 128, 88),  # khaki
    "trim": (58, 58, 60),
    "grille": (14, 14, 14),
    "tire": (20, 20, 20),
    "rim": (176, 176, 180),
    "seat": (24, 24, 26),  # black leather
    "seat_pleat": (58, 58, 63),  # the lit tops of the pleats
    "light": (232, 232, 208),
    "tail": (170, 30, 30),
    "glass": (40, 52, 60),
    "gauge": (225, 225, 215),
    "amber": (235, 150, 30),
    "leather": (110, 68, 38),
    "spoke": (97, 97, 97),  # #616161
    "glow": (80, 170, 255),
    # Opaque tinted glass: in flight it hides the riders, who stay upright while the body banks (ADR 0026)
    "rear_glass": (38, 84, 160),
    "prop": (214, 170, 82),  # polished bronze
    "prop_hub": (236, 196, 110),
    "arm": (72, 76, 82),  # gunmetal
    # The hardtop (roof and the cargo area's upper panels) stays black under every paint. It is a
    # little bluer and darker than the "black" paint so the two read apart on a black body.
    "hardtop": (28, 29, 32),
    "hardtop_rib": (46, 47, 52),  # the lit tops of the roof ribs
}
NAMES = list(PALETTE)
# A power of two wide enough for a 4 px cell per swatch (16 swatches filled 64 px before "prop")
TEXTURE_WIDTH = 128
assert len(NAMES) * 4 <= TEXTURE_WIDTH, "the palette no longer fits in the texture"
# Swatch alpha, 255 unless listed. Alpha 0 marks the headlight lenses as emissive for the
# entity_emissive material; the materials the lenses use while the headlights are off ignore alpha
# (ADR 0020). entity_emissive_alpha makes a texel glow when its alpha is low but not 0 (ADR 0022).
ALPHA = {"light": 0, "glow": 40}

# Body color of each paint (ADR 0031). Khaki writes suv.png; the others write suv_<paint>.png.
# The red stays darker than the "tail" swatch so the tail lights still show on a red body, the orange
# stays darker than the "amber" swatch, and the black stays lighter than the "grille" so the slots show.
BODY_PAINTS = {
    "khaki": PALETTE["body"],
    "green": (62, 96, 56),
    "red": (128, 22, 26),
    "white": (222, 222, 216),
    "light_gray": (156, 156, 152),
    "gray": (92, 94, 98),
    "black": (34, 34, 36),
    "orange": (190, 92, 28),
    "yellow": (214, 178, 44),
    "lime": (112, 160, 42),
    "cyan": (30, 118, 124),
    "light_blue": (92, 150, 204),
    "blue": (40, 58, 128),
    "purple": (94, 46, 128),
    "magenta": (160, 52, 140),
    "pink": (214, 132, 162),
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


def turned(cube, pivot, rotation):
    cube["pivot"] = list(pivot)
    cube["rotation"] = list(rotation)
    return cube


def mirrored(cube):
    """The same cube on the other side of the center line (x -> -x)."""
    (x, y, z), (w, h, d) = cube["origin"], cube["size"]
    copy = {**cube, "origin": [-(x + w), y, z]}
    if "pivot" in cube:
        copy["pivot"] = [-cube["pivot"][0], *cube["pivot"][1:]]
    if "rotation" in cube:
        rx, ry, rz = cube["rotation"]
        copy["rotation"] = [rx, -ry, -rz]
    return copy


def both_sides(cubes):
    """Cubes defined on the +x (right) side, plus their mirror images on the left."""
    return [*cubes, *[mirrored(c) for c in cubes]]


# The rear end, 6 px behind where the first SUV ended, leaves room for a cargo area behind the rear
# doors under a black hardtop, like a four-door Wrangler. The rear wheels sit 5 px further back than
# the first SUV's, under the cargo area.
REAR = -32  # z of the tailgate's outer face
CARGO_FRONT = -19  # z where the rear doors end and the cargo area's fixed panels begin
ROOF_Y = 29  # underside of the roof

# The windshield leans back: its frame turns around the lower frame's edge. Written here, a positive x
# rotation tips +y toward the rear (-z) in game; a negative one leaned the frame out over the hood.
# The roof starts where the A-pillars meet it.
WINDSHIELD_LEAN = 25  # degrees back from vertical
WINDSHIELD_PIVOT = (0, 17, 12.5)
_LEAN_SIN = math.sin(math.radians(WINDSHIELD_LEAN))
_LEAN_COS = math.cos(math.radians(WINDSHIELD_LEAN))
_LEAN_TAN = math.tan(math.radians(WINDSHIELD_LEAN))
ROOF_FRONT = 12.5 - (ROOF_Y + 1 - 17) * _LEAN_TAN + 0.6


def windshield_part(x0, y0, z0, x1, y1, z1, color):
    return turned(box(x0, y0, z0, x1, y1, z1, color), WINDSHIELD_PIVOT, (WINDSHIELD_LEAN, 0, 0))


# Distance of the wheel hubs from the center line. The tires stand 1.5 px out from the body's side
# (x 13), under over-fenders.
HUB_X = 15.5
# Outer face of the flares: 2.75 px out from the body's side, over the inner half of the tires
FLARE_X = 15.75
FRONT_AXLE_Z, REAR_AXLE_Z = 17, -21
# Wheel arch: the inside of each flare. Its flat top's underside, the top's half length, and the inner
# lower end of each slope, ahead of and behind the axle. The inner edge stays at least 6.3 px from the
# axle, clear of the tire.
ARCH_TOP_Y, ARCH_TOP_HALF = 12.3, 4
ARCH_FOOT_Y, ARCH_FOOT_Z = 8, 7
ARCH_RUN_PER_RISE = (ARCH_FOOT_Z - ARCH_TOP_HALF) / (ARCH_TOP_Y - ARCH_FOOT_Y)

body = [
    # Chassis and floor
    box(-13, 4, REAR + 1, 13, 7, 24, "trim"),
    # Hood (engine compartment) above the front arches; its lower sides follow the arches below
    box(-13, ARCH_TOP_Y, 13, 13, 17, 25, "body"),
    box(-11.4, 7, 13, 11.4, ARCH_TOP_Y, 25, "body"),
    # Dashboard
    box(-12, 13, 10, 12, 17, 13, "trim"),
    # Windshield lower frame and A-pillars, leaning back
    windshield_part(-12, 17, 12.5, 12, 18, 13, "trim"),
    *both_sides([windshield_part(12, 17, 12, 13, 17 + (ROOF_Y + 0.8 - 17) / _LEAN_COS, 13, "body")]),
    # Rearview mirror (center of the windshield's top edge, behind the leaning glass)
    box(-0.5, 26.5, ROOF_FRONT - 0.8, 0.5, ROOF_Y, ROOF_FRONT - 0.3, "trim"),
    box(-2.5, 25, ROOF_FRONT - 1.3, 2.5, 26.5, ROOF_FRONT - 0.8, "rim"),
    # Black hardtop roof
    box(-13, ROOF_Y, REAR, 13, ROOF_Y + 1, ROOF_FRONT, "hardtop"),
    # B-pillars, down to the floor so they close the gap between the front and rear doors
    *both_sides([box(12, 7, -6, 13, ROOF_Y, -5, "body")]),
    # Cargo area sides: body-colored below the belt line, the black hardtop above it with a closed,
    # tinted quarter window
    *both_sides([
        box(12, 17, REAR, 13, ROOF_Y, CARGO_FRONT, "hardtop"),
        box(13, 18.5, REAR + 2.5, 13.1, 27, CARGO_FRONT - 1.5, "glass"),
    ]),
    # Cargo floor
    box(-12, 7, REAR + 1, 12, 7.3, CARGO_FRONT, "hardtop"),
    # Rear: body-colored tailgate, and the hardtop's header over the rear window with the third brake
    # light under it. On the ground the rear window stays open; the rear_glass bone closes it in the
    # other forms (ADR 0026).
    box(-13, 7, REAR, 13, 17, REAR + 1, "body"),
    box(-13, 27, REAR, 13, ROOF_Y, REAR + 1, "hardtop"),
    box(-1.5, 26.3, REAR - 0.2, 1.5, 27, REAR, "tail"),
    # Tall tail lights at the rear corners, and the tailgate hinges on the right
    *both_sides([box(9.6, 10, REAR - 0.3, 12.8, 16, REAR, "tail")]),
    box(6.2, 14.2, REAR - 0.3, 9.0, 15.2, REAR, "body"),
    box(6.2, 10.4, REAR - 0.3, 9.0, 11.4, REAR, "body"),
    # Exhaust pipe (rear right = +x side, sticking out backward from under the rear bumper)
    box(8, 1.8, REAR - 2, 10, 3.4, -22, "trim"),
    box(7.75, 1.55, REAR - 2.5, 10.25, 3.65, REAR - 2, "rim"),
    # Side steps, running between the fender flares
    *both_sides([box(13, 4, -13, 15.5, 6, 10, "trim")]),
]

# Hood: a raised power dome, a black mesh vent on each side of it, washer nozzles, the cowl's vent
# strip with the wipers parked on it, and the latches at the rear corners
body += [
    box(-9.5, 17, 15, 9.5, 17.4, 24.6, "body"),
    box(-8.5, 17.4, 15.6, 8.5, 17.7, 24.1, "body"),
    box(-13, 17, 13, 13, 17.3, 14.6, "trim"),  # cowl
    box(-3, 17.3, 13.4, 3, 17.4, 14.3, "grille"),  # cowl vent
]
body += both_sides([
    box(10, 17, 17.5, 12.2, 17.5, 22.5, "grille"),  # vent
    *[box(10.2, 17.5, z, 12.0, 17.6, z + 0.35, "trim") for z in (18, 18.9, 19.8, 20.7, 21.6)],  # vent mesh
    box(2.4, 17.7, 21, 3.2, 18.1, 22, "grille"),  # washer nozzle
    box(11.4, 16.2, 13.8, 12.6, 17.7, 15.2, "grille"),  # latch
    turned(box(1, 17.3, 13.6, 9.5, 17.6, 13.9, "grille"), (1, 17.3, 13.75), (0, -8, 0)),  # wiper
])




FLARE_THICKNESS = 2


def arch_side_z(z_center, side, y):
    """z of the arch's inner edge at height y on its front (side +1) or rear (side -1) slope."""
    return z_center + side * (ARCH_FOOT_Z - (y - ARCH_FOOT_Y) * ARCH_RUN_PER_RISE)


def flare_face_z(z_center, side, y):
    """z of the flare's outer face at height y on its front (side +1) or rear (side -1) slope."""
    return arch_side_z(z_center, side, y) + side * FLARE_THICKNESS * math.hypot(1, ARCH_RUN_PER_RISE)


def fender_flare(z_center, front_leg_bottom, rear_leg_bottom):
    """A black trapezoid flare over a wheel on the +x side, like a Wrangler's: a flat top over the tire,
    a side sloping down and out at each end, and a leg under each slope that drops toward the bumper or
    the side step."""
    length = math.hypot(ARCH_TOP_Y - ARCH_FOOT_Y, ARCH_FOOT_Z - ARCH_TOP_HALF) + 0.6  # closes the corner
    slope = round(math.degrees(math.atan(ARCH_RUN_PER_RISE)), 3)
    x1 = FLARE_X
    cubes = [box(13, ARCH_TOP_Y, z_center - ARCH_TOP_HALF - 0.8, x1, ARCH_TOP_Y + FLARE_THICKNESS,
                 z_center + ARCH_TOP_HALF + 0.8, "trim")]
    # Each slope stands on its lower inner end and tips its top toward the wheel's center; a positive x
    # rotation here tips +y toward -z in game (see WINDSHIELD_LEAN).
    for side in (1, -1):
        z0 = z_center + side * ARCH_FOOT_Z
        z1 = z0 + side * FLARE_THICKNESS
        cubes.append(turned(box(13, ARCH_FOOT_Y, min(z0, z1), x1, ARCH_FOOT_Y + length, max(z0, z1), "trim"),
                            (13, ARCH_FOOT_Y, z0), (side * slope, 0, 0)))
    for side, leg_bottom in ((1, front_leg_bottom), (-1, rear_leg_bottom)):
        z0 = z_center + side * ARCH_FOOT_Z
        z1 = z0 + side * 1.9
        cubes.append(box(13, leg_bottom, min(z0, z1), x1, ARCH_FOOT_Y + 0.5, max(z0, z1), "trim"))
    return cubes


def arch_cut(x0, x1, y0, y1, z_back, z_front, z_center, color, step=0.5):
    """A side panel from z_back to z_front whose part below the arch top stops at the arch's slope: strips
    `step` tall, each ending at the slope's z at its lower edge so none pokes into the arch. The slope
    moves toward the axle as it rises, so each step leaves a sliver of at most 0.35 px outside the arch,
    which the 2 px flare covers; the panel's edge reads as the flare's outline."""
    cubes = []
    if y1 > ARCH_TOP_Y:
        cubes.append(box(x0, max(y0, ARCH_TOP_Y), z_back, x1, y1, z_front, color))
    y = y0
    while y < min(y1, ARCH_TOP_Y) - 1e-6:
        top = min(y + step, y1, ARCH_TOP_Y)
        front_cut, rear_cut = arch_side_z(z_center, 1, y), arch_side_z(z_center, -1, y)
        # The panel lies ahead of the arch, behind it, or on both sides of it
        if z_front > front_cut:
            cubes.append(box(x0, y, max(z_back, front_cut), x1, top, z_front, color))
        if z_back < rear_cut:
            cubes.append(box(x0, y, z_back, x1, top, min(z_front, rear_cut), color))
        y = top
    return cubes


# The hood's lower sides, cut along the front arch, outside the liners
body += both_sides(arch_cut(11.4, 13, 7, ARCH_TOP_Y, 13, 25, FRONT_AXLE_Z, "body"))
# The cargo area's body-colored side below the belt line, cut along the rear arch
body += both_sides(arch_cut(12, 13, 7, 17, REAR + 1, CARGO_FRONT, REAR_AXLE_Z, "body"))
# Round fuel door on the left side of the cargo area, behind the rear flare and under the belt line
body += disc("x", (-13, 14.8, -29.3), 1.2, -13.25, -13, [i * 11.25 for i in range(8)], "grille")  # 32 sides
# Black inner liners behind each arch, so the cabin does not show through it
body += both_sides([
    box(11.4, ARCH_FOOT_Y - 1, z - ARCH_FOOT_Z - 0.5, 11.6, ARCH_TOP_Y + 0.5, z + ARCH_FOOT_Z + 0.5, "grille")
    for z in (FRONT_AXLE_Z, REAR_AXLE_Z)
])
LAMP_Y0, LAMP_Y1 = 11.4, 12.2
body += both_sides([
    *fender_flare(FRONT_AXLE_Z, 5, 4),
    *fender_flare(REAR_AXLE_Z, 4, 4),
    # Beside the headlights (center y 12.3): a light strip standing a little proud of the front flare's
    # sloping front face, and the turn signal on the flare's outer side
    box(13.3, LAMP_Y0, flare_face_z(FRONT_AXLE_Z, 1, LAMP_Y1) - 0.2, FLARE_X - 0.2, LAMP_Y1,
        flare_face_z(FRONT_AXLE_Z, 1, LAMP_Y0) + 0.1, "light"),
    box(FLARE_X, LAMP_Y0, arch_side_z(FRONT_AXLE_Z, 1, LAMP_Y0) + 0.6, FLARE_X + 0.1, LAMP_Y1,
        flare_face_z(FRONT_AXLE_Z, 1, LAMP_Y1) - 0.1, "amber"),
])


def chamfered_band(y0, y1, z_back, z_front, half_width, chamfer, angle=30):
    """A slab across the car whose front corners are cut back at `angle` degrees, so it reads as a
    trapezoid from above: a straight middle, and at each corner a block turned back around the inner end
    of the cut (a positive y rotation turns +x toward -z) over a side block that fills behind it."""
    cx = half_width - chamfer
    radians = math.radians(angle)
    tan = math.tan(radians)
    corner = turned(box(cx, y0, z_back, cx + chamfer / math.cos(radians), y1, z_front, "trim"),
                    (cx, y0, z_front), (0, angle, 0))
    side = box(cx, y0, z_back, half_width, y1, z_front - chamfer * tan, "trim")
    return [box(-cx, y0, z_back, cx, y1, z_front, "trim"), *both_sides([corner, side])]


# Front bumper: a thick band whose corners are cut back toward the flares, between a tucked-in lower lip
# and a slightly set-back top edge, so it reads as a trapezoid from above
body += chamfered_band(2.5, 3.5, 25, 28.2, 14.7, 2.2)
body += chamfered_band(3.5, 7.3, 24, 29.5, 16, 3.5)
body += chamfered_band(7.3, 8, 25, 28.9, 15.4, 2.9)

# Rear bumper: the same kind of band facing backward, with red reflectors at its ends and red tow
# hooks under it
def facing_back(cube):
    """The same cube mirrored front to back (z -> -z). The bumper's corners turn only around y."""
    (x, y, z), (w, h, d) = cube["origin"], cube["size"]
    copy = {**cube, "origin": [x, y, -(z + d)]}
    if "pivot" in cube:
        px, py, pz = cube["pivot"]
        rx, ry, rz = cube["rotation"]
        copy["pivot"] = [px, py, -pz]
        copy["rotation"] = [rx, -ry, rz]
    return copy


body += [facing_back(c) for c in chamfered_band(3, 7, 27.5, -REAR + 1.5, 15.5, 2.5)]
body += both_sides([
    box(10.5, 5, REAR - 1.6, 13, 6.2, REAR - 1.5, "tail"),  # reflector
    box(7.4, 1.8, REAR - 1.2, 8.4, 3, REAR + 1, "tail"),  # tow hook
])


def pleated_seat(x0, x1, z_back):
    """A black leather bucket seat: pleats running front to back on the cushion and stacked
    across the backrest, between raised side bolsters. The gaps between the pleats show the
    darker base, so the pleats read as stripes like a tuck-and-roll seat."""
    z_front = z_back + 9
    bolster = 1.5
    rib, gap = 0.7, 0.35
    inner0, inner1 = x0 + bolster, x1 - bolster
    count = int((inner1 - inner0 + gap) // (rib + gap))
    margin = (inner1 - inner0 - (count * rib + (count - 1) * gap)) / 2
    cubes = [
        # Cushion and backrest
        box(x0, 7, z_back + 1, x1, 10, z_front, "seat"),
        box(x0, 10, z_back, x1, 19, z_back + 1, "seat"),
        # Side bolsters of the cushion and the backrest
        box(x0, 10, z_back + 1, inner0, 10.8, z_front, "seat"),
        box(inner1, 10, z_back + 1, x1, 10.8, z_front, "seat"),
        box(x0, 10.8, z_back + 1, inner0, 19, z_back + 1.8, "seat"),
        box(inner1, 10.8, z_back + 1, x1, 19, z_back + 1.8, "seat"),
        # Rolled front edge of the cushion
        box(x0, 9.4, z_front, x1, 10.4, z_front + 0.4, "seat_pleat"),
    ]
    for i in range(count):
        a = inner0 + margin + i * (rib + gap)
        cubes.append(box(a, 10, z_back + 1.5, a + rib, 10.4, z_front - 0.5, "seat_pleat"))
    for i in range(7):
        y = 11.2 + i * (rib + gap)
        cubes.append(box(inner0, y, z_back + 1, inner1, y + rib, z_back + 1.4, "seat_pleat"))
    return cubes


# Seats: 2 in front and a rear bench made of two halves
body += pleated_seat(2, 11, 0)
body += pleated_seat(-11, -2, 0)
body += pleated_seat(-11, 0, -18)
body += pleated_seat(0, 11, -18)

# Steering wheel (+x side; shown in game as right-hand drive), tilted 20° with its top toward the driver
# (a positive x rotation tips +y toward -z in game, see WINDSHIELD_LEAN), and set back from the dashboard
# far enough that the tilted rim clears it. Like the tires, the rim is a ring of thin blocks turned
# around the column. Brown leather rim, gray spokes, and a black hub and column
WHEEL_CENTER = (6.0, 16.5)  # (x, y)
WHEEL_PIVOT = [WHEEL_CENTER[0], WHEEL_CENTER[1], 8.7]
WHEEL_RADIUS = 2.4
WHEEL_TILT = 20


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


def steering_part(x0, y0, x1, y1, color, z0=8.2, z1=9.0, spin=0):
    cube = box(x0, y0, z0, x1, y1, z1, color)
    cube["pivot"] = WHEEL_PIVOT
    cube["rotation"] = tilted_spin(spin)
    return cube


def small(cx, cy, w, h, color, z0=8.2, z1=9.0):
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
steering += [steering_part(cx - 0.7, cy - 0.7, cx + 0.7, cy + 0.7, "grille", 8.3, 9.1, spin) for spin in (0, 45)]  # hub
steering += [
    small(cx - 1.2, cy, 1.2, 0.5, "spoke"),  # spoke (left)
    small(cx + 1.2, cy, 1.2, 0.5, "spoke"),  # spoke (right)
    small(cx, cy - 1.2, 0.5, 1.2, "spoke"),  # spoke (bottom)
    small(cx, cy, 0.8, 0.8, "grille", 9.1, 11.0),  # column
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


# Round fog lamps in black pockets near the front bumper's ends
body += both_sides([
    box(8.8, 4.2, 29.5, 11.8, 6.6, 29.55, "grille"),
    *round_face((10.3, 5.4, 0), 0.9, 29.55, 29.62, "light"),
])

# Ribs on the hardtop: two front panels split down the middle over the front seats, a seam across,
# and long ribs running back over the rear panel
ROOF_TOP = ROOF_Y + 1
ROOF_SEAM = -3
# The hardtop's thick side edge stands a little proud of the doors and drops over their frames' top rails
body += both_sides([box(13, ROOF_Y - 0.4, REAR, 13.4, ROOF_TOP + 0.2, ROOF_FRONT, "hardtop")])
body += [
    box(-0.15, ROOF_TOP, ROOF_SEAM, 0.15, ROOF_TOP + 0.05, ROOF_FRONT - 0.5, "grille"),
    box(-13, ROOF_TOP, ROOF_SEAM - 0.15, 13, ROOF_TOP + 0.05, ROOF_SEAM + 0.15, "grille"),
    *both_sides([box(x - 0.4, ROOF_TOP, ROOF_SEAM + 1.5, x + 0.4, ROOF_TOP + 0.3, ROOF_FRONT - 1.5, "hardtop_rib")
                 for x in (3, 6.5, 10)]),
    *[box(x - 0.4, ROOF_TOP, REAR + 2, x + 0.4, ROOF_TOP + 0.3, ROOF_SEAM - 1.5, "hardtop_rib")
      for x in (-10.5, -7, -3.5, 0, 3.5, 7, 10.5)],
]

# Gauges (behind the steering wheel, on the driver's side of the dashboard), like an old utility
# 4x4: a black instrument panel with a large speedometer in the middle and two small gauges on each
# side. Every dial has a black face, white ticks and a white needle, in a chrome bezel. No logo or
# lettering (ADR 0009).
def dial(cx, cy, radius, ticks, needle_angle):
    center = (cx, cy, 10)
    cubes = round_face(center, radius + 0.25, 10, 10.5, "rim")  # bezel
    cubes += round_face(center, radius, 9.9, 10, "grille")  # face
    # Ticks on a 270° sweep that leaves the bottom open, as on a speedometer
    for i in range(ticks):
        angle = math.radians(225 - i * 270 / (ticks - 1))
        tx, ty = cx + radius * 0.78 * math.cos(angle), cy + radius * 0.78 * math.sin(angle)
        cubes.append(box(tx - 0.08, ty - 0.08, 9.85, tx + 0.08, ty + 0.08, 9.9, "gauge"))
    needle = box(cx - 0.06, cy, 9.8, cx + 0.06, cy + radius * 0.7, 9.85, "gauge")
    needle["pivot"] = list(center)
    needle["rotation"] = [0, 0, needle_angle]
    cubes.append(needle)
    cubes.append(box(cx - 0.15, cy - 0.15, 9.78, cx + 0.15, cy + 0.15, 9.85, "trim"))  # needle hub
    return cubes


body.append(box(1.6, 15.6, 10.5, 10.4, 20.9, 10.9, "grille"))  # instrument panel
body += dial(6, 18.2, 1.8, 9, 40)  # speedometer
for gx in (3.3, 8.7):
    body += dial(gx, 19.3, 0.85, 5, 30)
    body += dial(gx, 17.2, 0.85, 5, -30)

# Passenger side of the dashboard, like an old utility 4x4: a flat body-colored panel under a black
# pad along the top, a chrome windshield latch at the outer end of the pad, a black grab bar standing
# off the panel on two posts, a black box under the bar, and a glovebox lid a little proud of the panel
# at the outer end with a chrome knob. The driver's side keeps its gauges and wheel.
body += [
    box(-12, 13, 9.9, -1, 16.3, 10, "body"),  # panel
    box(-12, 16.3, 9.7, -1, 17, 10, "grille"),  # pad
    box(-11.3, 16.1, 9.5, -10.5, 17.3, 9.7, "rim"),  # windshield latch
    box(-9.6, 15.3, 9.2, -3, 15.7, 9.5, "grille"),  # grab bar
    *[box(x - 0.2, 15.3, 9.5, x + 0.2, 15.7, 9.9, "trim") for x in (-9.3, -3.3)],  # bar posts
    box(-6.6, 13.9, 9.6, -2.4, 14.9, 9.9, "grille"),  # box under the bar
    box(-11.7, 13.3, 9.75, -8.1, 14.9, 9.9, "body"),  # glovebox lid
    box(-9.05, 14.4, 9.65, -8.75, 14.7, 9.75, "rim"),  # glovebox knob
]

# Floor shifters between the front seats, like an old utility 4x4: a tall shift lever in an
# accordion rubber boot, and two shorter transfer levers behind it. Each lever leans back toward
# the seats (a positive x rotation tips +y toward -z in game, see WINDSHIELD_LEAN) and ends in a ball
# knob.
def floor_lever(x, z, height, knob, lean=15):
    pivot = [x, 7, z]

    def leaned(cube):
        cube["pivot"] = pivot
        cube["rotation"] = [lean, 0, 0]
        return cube

    top = 7 + height
    return [
        leaned(box(x - 0.2, 7, z - 0.2, x + 0.2, top, z + 0.2, "trim")),  # rod
        leaned(box(x - knob, top - knob * 0.8, z - knob * 0.8, x + knob, top + knob * 0.8, z + knob * 0.8, "grille")),
        leaned(box(x - knob * 0.8, top - knob, z - knob * 0.8, x + knob * 0.8, top + knob, z + knob * 0.8, "grille")),
        leaned(box(x - knob * 0.8, top - knob * 0.8, z - knob, x + knob * 0.8, top + knob * 0.8, z + knob, "grille")),
    ]


SHIFT_X, SHIFT_Z = 0, 8.5
body.append(box(-1.8, 7, 4, 1.8, 7.6, 11, "trim"))  # transmission tunnel
BOOT_RINGS = ((1.0, 0.5), (0.75, 0.4), (0.85, 0.4), (0.6, 0.4), (0.7, 0.35), (0.45, 0.4))  # (half width, height)
for i, (half, height) in enumerate(BOOT_RINGS):
    y = 7.6 + sum(h for _, h in BOOT_RINGS[:i])
    body.append(box(SHIFT_X - half, y, SHIFT_Z - half, SHIFT_X + half, y + height, SHIFT_Z + half, "tire"))  # boot
body += floor_lever(SHIFT_X, SHIFT_Z, 7.2, 0.55)
for x in (-1.1, 1.1):
    body.append(box(x - 0.4, 7.6, 6.1, x + 0.4, 8.1, 6.9, "tire"))  # boot
    body += floor_lever(x, 6.5, 4.6, 0.4)

# Pedals in the driver's footwell (+x side): clutch and brake are square rubber pads with ribs on
# arms hanging from under the dashboard, and the accelerator is a long, narrow pad hinged at the
# floor, its rear end raised (a negative x rotation lifts -z toward +y in game, see WINDSHIELD_LEAN).
for px in (4.4, 6.6):  # clutch, brake
    body += [
        box(px - 0.15, 9.4, 11.7, px + 0.15, 13, 12, "trim"),  # arm
        box(px - 0.9, 8.2, 11.4, px + 0.9, 9.6, 11.7, "grille"),  # pad
    ]
    body += [box(px - 0.8, y, 11.3, px + 0.8, y + 0.2, 11.4, "trim") for y in (8.45, 8.8, 9.15)]  # ribs
accelerator = box(8.3, 7, 10.2, 9.3, 7.3, 12.8, "grille")
accelerator["pivot"] = [8.8, 7, 12.8]
accelerator["rotation"] = [-25, 0, 0]
body.append(accelerator)


# Doors (ADR 0009). The +x side of this definition becomes the right side in game. The pivot sits on the hinge (front edge)
DOORS = {
    "door_fr": (+1, 12, -5),  # (side, front-edge z, rear-edge z)
    "door_rr": (+1, -6, CARGO_FRONT),
    "door_fl": (-1, 12, -5),
    "door_rl": (-1, -6, CARGO_FRONT),
}
# The front door's window frame leans with the windshield, so its window is a trapezoid. The frame's
# front post sits just behind the A-pillar, turned around the same pivot.
FRONT_POST_LENGTH = (ROOF_Y - 17) / _LEAN_COS


def window_frame_piece(y0, z0, y1, z1):
    """A window frame bar: body-colored outside and black inside, like the door cards."""
    return [box(12.5, y0, z0, 13, y1, z1, "body"), box(12, y0, z0, 12.5, y1, z1, "trim")]


def door(name):
    """A door with its window frame and a black door card inside, hinged at its front edge. The front
    doors carry the side mirrors, so the mirrors swing open with them."""
    side, z_front, z_back = DOORS[name]
    # Each door's lower corner nearest a wheel follows that wheel's arch
    axle = FRONT_AXLE_Z if z_front > 0 else REAR_AXLE_Z
    panel = arch_cut(12, 13, 7, 17, z_back, z_front, axle, "body")
    card = arch_cut(11.8, 12, 8, 16, z_back + 0.6, z_front - 0.6, axle, "trim")
    if z_front > 0:
        front_post = [windshield_part(x0, 17, 11, x0 + 0.5, 17 + FRONT_POST_LENGTH, 12, color)
                      for x0, color in ((12.5, "body"), (12, "trim"))]
        top_front = ROOF_FRONT - 0.4
        side_mirror = [
            box(13, 17, 10, 14, 18, 11, "body"),
            box(14, 16.5, 9.5, 16.5, 19.5, 11, "body"),
            box(14.2, 17, 9.3, 16.3, 19, 9.5, "rim"),
        ]
    else:
        front_post = window_frame_piece(17, z_front - 1, ROOF_Y, z_front)
        top_front = z_front
        side_mirror = []
    cubes = [
        *panel,
        *card,
        *front_post,
        box(13, 14.4, z_back + 1.5, 13.35, 15.1, z_back + 4.5, "grille"),  # door handle, near the rear edge
        *window_frame_piece(17, z_back, ROOF_Y, z_back + 1),  # rear post
        *window_frame_piece(ROOF_Y - 1, z_back, ROOF_Y, top_front),  # top rail
        *side_mirror,
    ]
    return {
        "name": name,
        "parent": "body",
        "pivot": [12.5 * side, 12, z_front],
        "cubes": cubes if side > 0 else [mirrored(c) for c in cubes],
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
    # Sidewall filling the inside of the tread, inset slightly so the tread edge stands out. On the road
    # wheels it is a ring of thin blocks: turned squares would reach radius * sqrt(2) at their corners,
    # past the tread and into the flares and bumpers as the wheel spins.
    if axis == "x":
        cubes += ring(center, a0 + 0.2, a1 - 0.2, 2.0, radius - 1.2, 24, "tire")
        cubes += disc(axis, center, 2.1, a0 + 0.2, a1 - 0.2, (0, 30, 60), "tire")
    else:
        cubes += disc(axis, center, radius - 1.2, a0 + 0.2, a1 - 0.2, (0, 30, 60), "tire")
    return cubes


def hub_span(x_out, inner, outer):
    """The x span from HUB_X + inner to HUB_X + outer on the side x_out (+1 = right, -1 = left), low end first."""
    return sorted((x_out * (HUB_X + inner), x_out * (HUB_X + outer)))


def around_axle(center, x0, x1, r0, r1, half_width, angles, color):
    """Blocks from r0 to r1 out from the axle (along x), half_width wide, one turned to each angle."""
    _, cy, cz = center
    cubes = []
    for angle in angles:
        cube = box(x0, cy + r0, cz - half_width, x1, cy + r1, cz + half_width, color)
        if angle:
            cube["rotation"] = [angle, 0, 0]
            cube["pivot"] = list(center)
        cubes.append(cube)
    return cubes


def ring(center, x0, x1, r0, r1, segments, color):
    """A ring from r0 to r1 around the axle, built from `segments` blocks that overlap a little."""
    half_chord = round(r1 * math.tan(math.radians(180 / segments)) + 0.05, 3)
    return around_axle(center, x0, x1, r0, r1, half_chord, [i * 360 / segments for i in range(segments)], color)


def wheel(name, x_out, z_center):
    """A road wheel modeled on a black eight-spoke off-road wheel: a lugged tire, a gray barrel behind the
    spokes, a black lip with chrome rivets, black spokes with a machined stripe down each, and a black
    hub with chrome lug nuts and a small center cap. Every turned set is symmetric under reversing its
    angles, so it looks the same whichever way the game turns x rotations. Nothing reaches past
    HUB_X + 2.5, where the submarine prop mounts (ADR 0042)."""
    center = (HUB_X * x_out, 6, z_center)

    def span(inner, outer):
        return hub_span(x_out, inner, outer)

    rivets = [i * 22.5 for i in range(16)]
    spokes = [22.5 + i * 45 for i in range(8)]
    cubes = [
        *round_tire("x", center, 6, *span(-2, 2), segments=24),
        # Shoulder lugs on every other tread block, standing out of the outer sidewall
        *around_axle(center, *span(1.8, 2.15), 5.1, 6, 0.75, [i * 30 for i in range(12)], "tire"),
        *disc("x", center, 3.6, *span(1.8, 1.85), (0, 30, 60), "trim"),  # barrel behind the spokes
        *ring(center, *span(1.85, 2.2), 3.25, 3.9, 24, "grille"),  # lip
        *around_axle(center, *span(2.2, 2.3), 3.45, 3.7, 0.12, rivets, "rim"),
        *around_axle(center, *span(1.85, 2.2), 1.1, 3.35, 0.42, spokes, "grille"),
        *around_axle(center, *span(2.2, 2.25), 1.5, 3.1, 0.1, spokes, "spoke"),  # machined stripe
        *disc("x", center, 1.25, *span(1.9, 2.35), (0, 30, 60), "grille"),  # hub
        *around_axle(center, *span(2.35, 2.45), 0.75, 0.97, 0.11, [i * 60 for i in range(6)], "rim"),
        *disc("x", center, 0.4, *span(2.35, 2.5), (0, 45), "spoke"),  # center cap
    ]
    return {"name": name, "parent": "root", "pivot": list(center), "cubes": cubes}


# The side windows and the windshield are open frames. Under water (ADR 0040) plates fill them, flush
# with the outside of the frames, in the same blue as the rear glass. The front side window is a
# trapezoid, so 1 px strips step down along the leaning front post. Each strip reaches from its lower
# end a little into the post, which the post hides, and sits 0.05 px inside the frame's outer face so
# the overlap does not fight the post for the same plane.
def front_post_back(y):
    """z of the rear face of the front door's leaning post at height y, which starts 1.5 px behind the pivot."""
    y0, z0 = WINDSHIELD_PIVOT[1] - 1.5 * _LEAN_SIN, WINDSHIELD_PIVOT[2] - 1.5 * _LEAN_COS
    return z0 - (y - y0) * _LEAN_TAN


WINDOWS_SEALED = [
    windshield_part(-12, 18, 12.9, 12, 17 + FRONT_POST_LENGTH, 13, "rear_glass"),
    *both_sides([
        *[box(12.85, y, -4, 12.95, y + 1, front_post_back(y) + 0.2, "rear_glass") for y in range(17, ROOF_Y - 1)],
        box(12.9, 17, CARGO_FRONT + 1, 13, ROOF_Y - 1, -7, "rear_glass"),
    ]),
]


# Segments of one prop blade: (inner radius, outer radius, half width, sweep in degrees). Each segment
# turns further around the axle than the one inside it, so the blade curves back like a ship
# propeller's scimitar blade (ADR 0042). The farthest corner stays inside the tire's inner radius (4.6).
PROP_BLADE = ((0.9, 2.0, 0.55, 0), (1.9, 3.3, 1.05, 14), (3.2, 4.3, 0.8, 30))


def prop(name, x_out, z_center):
    """A hub and four swept blades mounted on the outer face of the rear wheel's hub cap, in the wheel's
    plane and inside the tire's inner radius, so the tread ring frames the prop."""
    center = (HUB_X * x_out, 6, z_center)
    _, cy, cz = center
    x0, x1 = hub_span(x_out, 2.5, 3.1)
    blades = []
    for base in (0, 90, 180, 270):
        for r0, r1, half, sweep in PROP_BLADE:
            blade = box(x0 + 0.1, cy + r0, cz - half, x1 - 0.1, cy + r1, cz + half, "prop")
            if base + sweep:
                blade["rotation"] = [base + sweep, 0, 0]
                blade["pivot"] = list(center)
            blades.append(blade)
    # The hub stands a little proud of the blades, with a dark bore in its outer face.
    hub0, hub1 = (x0, x1 + 0.2) if x_out > 0 else (x0 - 0.2, x1)
    bore0, bore1 = (hub1, hub1 + 0.05) if x_out > 0 else (hub0 - 0.05, hub0)
    return {
        "name": name,
        "parent": "root",
        "pivot": list(center),
        "cubes": [
            *disc("x", center, 1.4, hub0, hub1, (0, 30, 60), "prop_hub"),
            *disc("x", center, 0.6, bore0, bore1, (0, 45), "tire"),
            *blades,
        ],
    }


# The folded wheels hang out from the body on arms in flight, like a hovering DeLorean (ADR 0043): the
# hover animation moves each wheel this far outward on top of lowering it 4 px. suv.anim.json is
# written by hand, so wheels_folded, wheels_deploy and wheels_retract must use the same value.
FOLD_OUT = 6
# How far the dive and submerged animations move each turned rear wheel out (ADR 0040), which the
# submarine arms reach to. Equal to FOLD_OUT, but set by a different animation.
SUB_OUT = 6
ARM_THICK = 1.4


def arm(name, x_out, z_center):
    """A gunmetal arm from inside the wheel arch down and out to the hub of the folded wheel, built from
    overlapping cubes along the diagonal so it needs no rotation. Hidden by scale outside flight."""
    s = x_out
    ax, ay = 12, 9  # inside the wheel arch
    # The hub on top of the folded wheel, whose top face is at y 4: the last cube rests on it
    hx, hy = HUB_X + FOLD_OUT, 4 + ARM_THICK / 2
    steps = 8
    cubes = []
    for i in range(steps):
        t = i / (steps - 1)
        x, y = ax + t * (hx - ax), ay + t * (hy - ay)
        cubes.append(box(s * x - 0.8, y - ARM_THICK / 2, z_center - 0.8,
                         s * x + 0.8, y + ARM_THICK / 2, z_center + 0.8, "arm"))
    # The hub pin the arm holds the wheel by
    cubes.append(box(s * hx - 1.2, 4, z_center - 1.2, s * hx + 1.2, 4.6, z_center + 1.2, "arm"))
    return {"name": name, "parent": "root", "pivot": [s * ax, ay, z_center], "cubes": cubes}


def sub_arm(name, x_out, z_center):
    """A gunmetal arm from the body to the hub of a rear wheel turned for the submarine (ADR 0040), which
    sits SUB_OUT px out with its axle along z. The arm lies against the tire's front face, opposite the
    prop on the rear face. Before turn_around the front is +z. Hidden by scale outside the submarine."""
    s = x_out
    hx = HUB_X + SUB_OUT
    xs = sorted((s * 11, s * (hx + 0.8)))
    face = z_center + 2  # the tire's front face
    return {
        "name": name,
        "parent": "root",
        "pivot": [s * 13, 6, z_center],
        "cubes": [
            box(xs[0], 5.3, face, xs[1], 6.7, face + 1.2, "arm"),
            box(s * hx - 1.2, 4.8, face + 1.2, s * hx + 1.2, 7.2, face + 1.6, "arm"),
        ],
    }


def glow(name, x_out, z_center):
    # A disc under the folded wheel (ADR 0022, moved out with it by ADR 0043). The render controller hides
    # it while the gear is down: on the ground and under water.
    x = (HUB_X + FOLD_OUT) * x_out
    return {
        "name": name,
        "parent": "root",
        "pivot": [x, 0, z_center],
        "cubes": [box(x - 5, -0.5, z_center - 5, x + 5, 0, z_center + 5, "glow")],
        "locators": {name.replace("glow", "hover"): [x, -0.5, z_center]},
    }


# Rear spare tire (on the tailgate, axle along z)
SPARE = (0, 13.5, REAR - 1.5)
body += round_tire("z", SPARE, 5, REAR - 3, REAR)
body += disc("z", SPARE, 2.3, REAR - 3.3, REAR - 3, (0, 30, 60), "rim")
body += disc("z", SPARE, 0.9, REAR - 3.5, REAR - 3.3, (0, 45), "trim")


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
                "identifier": "geometry.yasu_ride.suv",
                "texture_width": TEXTURE_WIDTH,
                "texture_height": 16,
                "visible_bounds_width": 5,
                "visible_bounds_height": 3,
                "visible_bounds_offset": [0, 1, 0],
            },
            "bones": [
                {"name": "root", "pivot": [0, 12, 0]},
                {"name": "body", "parent": "root", "pivot": [0, 7, 0], "cubes": body,
                 "locators": {"exhaust": [9, 2.6, REAR - 2.6]}},
                {"name": "headlights", "parent": "body", "pivot": [0, 7, 0], "cubes": headlights},
                # Shown only in flight by the render controller (ADR 0026)
                {"name": "rear_glass", "parent": "body", "pivot": [0, 7, 0],
                 "cubes": [box(-12, 17, REAR, 12, 27, REAR + 1, "rear_glass")]},
                wheel("wheel_fl", -1, FRONT_AXLE_Z),
                wheel("wheel_fr", +1, FRONT_AXLE_Z),
                wheel("wheel_rl", -1, REAR_AXLE_Z),
                wheel("wheel_rr", +1, REAR_AXLE_Z),
                # Hidden until the submarine form shows them (ADR 0040)
                {"name": "windows_sealed", "parent": "body", "pivot": [0, 7, 0], "cubes": WINDOWS_SEALED},
                prop("prop_rl", -1, REAR_AXLE_Z),
                prop("prop_rr", +1, REAR_AXLE_Z),
                glow("glow_fl", -1, FRONT_AXLE_Z),
                glow("glow_fr", +1, FRONT_AXLE_Z),
                glow("glow_rl", -1, REAR_AXLE_Z),
                glow("glow_rr", +1, REAR_AXLE_Z),
                arm("arm_fl", -1, FRONT_AXLE_Z),
                arm("arm_fr", +1, FRONT_AXLE_Z),
                arm("arm_rl", -1, REAR_AXLE_Z),
                arm("arm_rr", +1, REAR_AXLE_Z),
                sub_arm("sub_arm_rl", -1, REAR_AXLE_Z),
                sub_arm("sub_arm_rr", +1, REAR_AXLE_Z),
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

(MODELS / "suv.geo.json").write_text(json.dumps(geo, indent=1))


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


def swatches(body_color):
    colors = {**PALETTE, "body": body_color}

    def swatch(x, y):
        i = x // 4
        if y >= 4 or i >= len(NAMES):
            return (0, 0, 0)
        name = NAMES[i]
        return (*colors[name], ALPHA.get(name, 255))

    return swatch


ENTITY_TEXTURES.mkdir(parents=True, exist_ok=True)
ITEM_TEXTURES.mkdir(parents=True, exist_ok=True)
for paint, body_color in BODY_PAINTS.items():
    name = "suv" if paint == "khaki" else f"suv_{paint}"
    png(ENTITY_TEXTURES / f"{name}.png", TEXTURE_WIDTH, 16, swatches(body_color))


def icon(x, y):
    # 16x16 icon: khaki body and black tires
    if 9 <= y <= 12 and (3 <= x <= 5 or 10 <= x <= 12):
        return PALETTE["tire"]
    if 4 <= y <= 9 and 1 <= x <= 14:
        return PALETTE["body"]
    if 1 <= y <= 3 and 4 <= x <= 11:
        return PALETTE["glass"]
    return (0, 0, 0)


png(ITEM_TEXTURES / "suv_item.png", 16, 16, icon)


def switch_icon(x, y):
    # 16x16 headlight switch icon: a glowing round lamp on a dark switch plate
    if (x - 7.5) ** 2 + (y - 6.5) ** 2 <= 16:
        return PALETTE["light"]
    if 3 <= x <= 12 and 11 <= y <= 14:
        return PALETTE["trim"]
    return (0, 0, 0, 0)


png(ITEM_TEXTURES / "headlight_switch.png", 16, 16, switch_icon)
print("cubes:", sum(len(b.get("cubes", [])) for b in geo["minecraft:geometry"][0]["bones"]))
