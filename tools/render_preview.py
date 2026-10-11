"""Render the README previews of the vehicle model from its front-left corner.

    python3 -I tools/render_preview.py <resource pack> <output dir>          write the images
    python3 -I tools/render_preview.py <resource pack> <output dir> --check  fail if any is stale

Add --icons <pack dir> ... to either command to also write or check pack_icon.png in each pack: a
256-pixel RGB icon of the flying pose with the lamps on, framed on its own, with a cyan glow behind
each folded wheel over a charcoal and orange background. yasu_ride_test_bp gets it in grayscale, so
the test pack stands out in the pack list.

Four poses share one camera and one scale, so they line up side by side in the README: on the
ground, with the headlights on at night, flying with the wheels folded (ADR 0027), and under water
as a submarine (ADR 0045).

Only the standard library is used, like gen_model.py. The arithmetic avoids math.sin/cos (their
last bit can differ between platforms' libm) so the same model renders to the same pixels on a Mac
and on the Linux CI runner. --check compares decoded pixels rather than PNG bytes, because zlib
builds do not all compress identically.
"""
import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

GEOMETRY = "models/entity/yasu_ride/suv.geo.json"
TEXTURE = "textures/entity/yasu_ride/suv.png"
ANIMATIONS = "animations/yasu_ride/suv.anim.json"
WIDTH, HEIGHT = 800, 600
SUPERSAMPLE = 3
MARGIN = 0.04  # fraction of the image kept empty around the union of all poses

# Seen from the vehicle's front-left at 45 degrees, about 25 degrees above the ground.
VIEW_DIRECTION = (-1.0, 0.65, -1.0)
CAMERA_DISTANCE = 6.0  # in multiples of the model's size; far enough to keep perspective mild

# Minecraft's fixed face shading: top faces full brightness, north/south 0.8, east/west 0.6, bottom 0.5.
SHADE_UP, SHADE_DOWN, SHADE_Z, SHADE_X = 1.0, 0.5, 0.8, 0.6

SHADOW_LAYERS = 12
SHADOW_ALPHA = 0.025  # per layer, so the center of the shadow is 0.3
SHADOW_GROWTH = 0.5  # pixels (model units) added around the footprint per layer

# Dusk: unlit surfaces are dimmed and tinted blue so the lamps stand out.
NIGHT_TINT = (0.6, 0.64, 0.8)
LAMP_LIT = (255, 246, 205)
# Light on the road ahead. In game it reaches 27 blocks (ADR 0024); the picture shows the first
# few so the vehicle keeps its size.
BEAM_LAYERS = 24
BEAM_LENGTH = 36.0
BEAM_ALPHA = 0.03
BEAM_SPREAD = 0.35  # half width gained per unit of length
BEAM_COLOR = (255, 232, 160)

# Flight: the takeoff lifts the vehicle 1.5 blocks (ADR 0021).
FLIGHT_LIFT = 24.0
GLOW_LIT = (130, 205, 255)
GLOW_POOL_LAYERS = 10
GLOW_POOL_ALPHA = 0.03
GLOW_POOL_SIZE = 1.0
GLOW_POOL_GROWTH = 0.6
FLIGHT_SHADOW_ALPHA = 0.012  # the shadow of a hovering vehicle is fainter

# Bloom around emissive faces, in output pixels. The lamps glow where they can be seen. The discs
# under the folded wheels are hidden from above, so their bloom is drawn through the body but only
# shows around it.
BLOOM_RADIUS = 6
BLOOM_PASSES = 3
BLOOM = {"lamp": {"strength": 1.6, "through_body": False}, "disc": {"strength": 2.2, "through_body": True}}

# Under water every surface takes a blue-green cast, over a seabed of the same color (ADR 0045).
WATER_TINT = (0.55, 0.78, 0.92)
SEABED_COLOR = (40, 120, 150)
SEABED_LAYERS = 10
SEABED_ALPHA = 0.06
SEABED_MARGIN = 14.0

# Pack icon: the flying pose on a charcoal background with one orange band from the lower-left
# corner to the middle of the right edge, and a cyan disc glowing under each folded wheel.
ICON_SIZE = 256  # Bedrock wants a square power-of-two icon no larger than 256 px
ICON_FILL = 0.8  # fraction of the icon width the vehicle spans
ICON_BACKGROUND = (22, 24, 28)  # #16181C
ICON_BAND_COLOR = (242, 140, 40)  # #F28C28
ICON_BAND_HEIGHT = 0.18  # fraction of the icon height
GLOW_DISC_COLOR = (90, 215, 255)  # #5AD7FF
GLOW_DISC_ALPHA = 0.9  # at the center, falling linearly to 0 at the rim
GLOW_DISC_REACH = 1.6  # rim radius in multiples of the wheel radius
ICON_GRAYSCALE_PACK = "yasu_ride_test_bp"

POSES = {
    "suv-front-left.png": {"lamps": False, "hover": False, "submarine": False},
    "suv-headlights.png": {"lamps": True, "hover": False, "submarine": False},
    "suv-flying.png": {"lamps": False, "hover": True, "submarine": False},
    "suv-submarine.png": {"lamps": False, "hover": False, "submarine": True},
}


def read_png(path):
    """Decode an 8-bit RGB or RGBA PNG without interlacing into rows of RGBA tuples."""
    data = path.read_bytes()
    pos, idat = 8, b""
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind, body = data[pos + 4 : pos + 8], data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            w, h, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or color not in (2, 6) or interlace:
                raise ValueError(f"{path}: only 8-bit RGB/RGBA PNGs without interlacing are supported")
        elif kind == b"IDAT":
            idat += body
        pos += 12 + length
    channels = 4 if color == 6 else 3
    stride = w * channels
    raw = zlib.decompress(idat)
    rows, prev = [], bytearray(stride)
    for y in range(h):
        filter_type = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1 : (y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if filter_type == 1:
                line[i] = (line[i] + a) & 0xFF
            elif filter_type == 2:
                line[i] = (line[i] + b) & 0xFF
            elif filter_type == 3:
                line[i] = (line[i] + (a + b) // 2) & 0xFF
            elif filter_type == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 0xFF
        rows.append([tuple(line[x * channels : x * channels + 3]) + ((line[x * channels + 3],) if channels == 4 else (255,)) for x in range(w)])
        prev = line
    return rows


def write_png(path, w, h, pixels, rgb=False):
    channels = 3 if rgb else 4
    if rgb:
        pixels = bytes(c for i, c in enumerate(pixels) if i % 4 != 3)
    raw = b"".join(b"\x00" + bytes(pixels[y * w * channels : (y + 1) * w * channels]) for y in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2 if rgb else 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def sin_cos(degrees):
    """Taylor series in plain float arithmetic, which every IEEE 754 platform computes identically."""
    r = degrees * 3.141592653589793 / 180.0
    s, c, term_s, term_c = 0.0, 0.0, r, 1.0
    for n in range(12):
        s += term_s
        c += term_c
        term_s *= -r * r / ((2 * n + 2) * (2 * n + 3))
        term_c *= -r * r / ((2 * n + 1) * (2 * n + 2))
    return s, c


def rotate(point, pivot, rotation):
    x, y, z = (point[i] - pivot[i] for i in range(3))
    for axis, degrees in zip("xyz", rotation):
        if not degrees:
            continue
        s, c = sin_cos(degrees)
        if axis == "x":
            y, z = y * c - z * s, y * s + z * c
        elif axis == "y":
            x, z = x * c + z * s, -x * s + z * c
        else:
            x, y = x * c - y * s, x * s + y * c
    return (x + pivot[0], y + pivot[1], z + pivot[2])


def face_color(texture, face, tex_w, tex_h):
    # gen_model.py paints every face a single color, so the center texel of the face's UV stands for it.
    # A Blockbench model with detailed textures would need real texture mapping here.
    (u, v), (du, dv) = face["uv"], face["uv_size"]
    x = min(int((u + du / 2) * len(texture[0]) / tex_w), len(texture[0]) - 1)
    y = min(int((v + dv / 2) * len(texture) / tex_h), len(texture) - 1)
    return texture[y][x]


def cube_faces(cube):
    (x, y, z), (w, h, d) = cube["origin"], cube["size"]
    x1, y1, z1 = x + w, y + h, z + d
    corners = {
        "north": [(x, y, z), (x, y1, z), (x1, y1, z), (x1, y, z)],
        "south": [(x, y, z1), (x1, y, z1), (x1, y1, z1), (x, y1, z1)],
        "west": [(x, y, z), (x, y, z1), (x, y1, z1), (x, y1, z)],
        "east": [(x1, y, z), (x1, y1, z), (x1, y1, z1), (x1, y, z1)],
        "down": [(x, y, z), (x1, y, z), (x1, y, z1), (x, y, z1)],
        "up": [(x, y1, z), (x, y1, z1), (x1, y1, z1), (x1, y1, z)],
    }
    pivot, rotation = cube.get("pivot", [0, 0, 0]), cube.get("rotation", [0, 0, 0])
    for name, quad in corners.items():
        yield name, [rotate(p, pivot, rotation) for p in quad]


def folded_wheels(animations):
    """Bone name -> (z rotation, position) of the folded wheels, read from the hover animation (ADR 0022)."""
    bones = animations["animations"]["animation.yasu_ride.suv.wheels_folded"]["bones"]
    return {
        name: (pose["rotation"][2], pose["position"])
        for name, pose in bones.items()
        if name.startswith("wheel_")
    }


def submerged_parts(animations):
    """Bone name -> (rotation, position) of the turned rear wheels and props, read from the submerged
    animation (ADR 0040). The props' spin is a Molang expression, so it is drawn at rest."""
    bones = animations["animations"]["animation.yasu_ride.suv.submerged"]["bones"]
    return {
        name: ([a if isinstance(a, (int, float)) else 0 for a in pose["rotation"]], pose["position"])
        for name, pose in bones.items()
        if "rotation" in pose
    }


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def normalize(a):
    n = math.sqrt(dot(a, a))  # sqrt is correctly rounded by IEEE 754, unlike sin/cos
    return (a[0] / n, a[1] / n, a[2] / n)


def shade(normal):
    nx, ny, nz = normal
    return nx * nx * SHADE_X + nz * nz * SHADE_Z + ny * ny * (SHADE_UP if ny > 0 else SHADE_DOWN)


def mirror(quad):
    # Bedrock geometry is mirrored on x compared with the world: the steering wheel at the model's
    # -x shows up on the right in game. Flipping x here makes the picture match the game.
    return [(-x, y, z) for x, y, z in quad]


def collect(geo, texture, folds, turns, pose):
    """Return the vehicle's faces as (quad, rgb, bloom group or None)."""
    desc = geo["description"]
    lift = FLIGHT_LIFT if pose["hover"] else 0.0
    if pose["lamps"] and not pose.get("icon"):
        tint = NIGHT_TINT
    elif pose["submarine"]:
        tint = WATER_TINT
    else:
        tint = (1.0, 1.0, 1.0)
    polygons = []
    for bone in geo["bones"]:
        name = bone["name"]
        # The render controller hides the glow while the gear is down: on the ground and under water (ADR 0022)
        if name.startswith("glow_") and not pose["hover"]:
            continue
        # The render controller shows the rear glass in every form but car
        if name == "rear_glass" and not (pose["hover"] or pose["submarine"]):
            continue
        # The wheel arms are scaled to zero outside flight (ADR 0043)
        if name.startswith("arm_") and not pose["hover"]:
            continue
        # The submarine bones are hidden outside the submarine form (ADR 0040)
        if (name == "windows_sealed" or name.startswith(("prop_", "sub_arm_"))) and not pose["submarine"]:
            continue
        # Each rotation sign below was pinned from the game on its own axis
        motion = None
        if pose["hover"] and name in folds:
            # The fold's z rotation turns the other way from this rotate() (ADR 0022: hub side down)
            angle, offset = folds[name]
            motion = ((0, 0, -angle), offset)
        elif pose["submarine"] and name in turns:
            # The right-handed x and y turn that the rear-hub test in tests/packs/resourcePack.test.ts
            # uses, whose direction was pinned from the game
            (rx, ry, _), offset = turns[name]
            motion = ((rx, ry, 0), offset)
        emissive = "lamp" if name == "headlights" and pose["lamps"] else "disc" if name.startswith("glow_") else None
        for cube in bone.get("cubes", []):
            for face, quad in cube_faces(cube):
                if motion:
                    rotation, (dx, dy, dz) = motion
                    quad = [rotate(p, bone["pivot"], rotation) for p in quad]
                    # Animation positions run along the model's axes: in game a positive x moves the +x
                    # rear wheel out (ADR 0043)
                    quad = [(x + dx, y + dy, z + dz) for x, y, z in quad]
                quad = mirror([(x, y + lift, z) for x, y, z in quad])
                normal = cross(sub(quad[1], quad[0]), sub(quad[3], quad[0]))
                if dot(normal, normal) == 0:
                    continue
                if emissive:
                    rgb = LAMP_LIT if emissive == "lamp" else GLOW_LIT
                else:
                    r, g, b, _ = face_color(texture, cube["uv"][face], desc["texture_width"], desc["texture_height"])
                    k = shade(normalize(normal))
                    rgb = (r * k * tint[0], g * k * tint[1], b * k * tint[2])
                polygons.append((quad, rgb, emissive))
    return polygons


def ground_layers(polygons, pose, ground_y):
    """Translucent quads on the ground as (quad, alpha, rgb): the shadow, then the headlight beam, the
    seabed, or the glow pools of the pose."""
    points = [p for quad, _, emissive in polygons if not emissive for p in quad]
    x_lo, x_hi = min(p[0] for p in points), max(p[0] for p in points)
    z_lo, z_hi = min(p[2] for p in points), max(p[2] for p in points)
    shadow_alpha = FLIGHT_SHADOW_ALPHA if pose["hover"] else SHADOW_ALPHA
    layers = []
    for layer in range(SHADOW_LAYERS):
        g = layer * SHADOW_GROWTH
        quad = [(x_lo - g, ground_y, z_lo - g), (x_hi + g, ground_y, z_lo - g), (x_hi + g, ground_y, z_hi + g), (x_lo - g, ground_y, z_hi + g)]
        layers.append((quad, shadow_alpha, (0, 0, 0)))
    if pose["lamps"]:
        # The front is the model's -z side (ADR 0009)
        half = (x_hi - x_lo) / 2 * 0.6
        for layer in range(BEAM_LAYERS):
            length = BEAM_LENGTH * (layer + 1) / BEAM_LAYERS
            spread = half + length * BEAM_SPREAD
            quad = [(-half, ground_y, z_lo), (-spread, ground_y, z_lo - length), (spread, ground_y, z_lo - length), (half, ground_y, z_lo)]
            layers.append((quad, BEAM_ALPHA, BEAM_COLOR))
    if pose["submarine"]:
        # A seabed of layered blue-green that fades out away from the vehicle
        for layer in range(SEABED_LAYERS):
            g = SEABED_MARGIN * (layer + 1) / SEABED_LAYERS
            quad = [(x_lo - g, ground_y, z_lo - g), (x_hi + g, ground_y, z_lo - g), (x_hi + g, ground_y, z_hi + g), (x_lo - g, ground_y, z_hi + g)]
            layers.append((quad, SEABED_ALPHA, SEABED_COLOR))
    if pose["hover"]:
        for quad, _, emissive in polygons:
            if emissive != "disc" or quad[0][1] != min(p[1] for p in quad):
                continue
            cx = sum(p[0] for p in quad) / 4
            cz = sum(p[2] for p in quad) / 4
            for layer in range(GLOW_POOL_LAYERS):
                s = GLOW_POOL_SIZE + layer * GLOW_POOL_GROWTH
                pool = [(cx - s, ground_y, cz - s), (cx + s, ground_y, cz - s), (cx + s, ground_y, cz + s), (cx - s, ground_y, cz + s)]
                layers.append((pool, GLOW_POOL_ALPHA, GLOW_LIT))
    return layers


class Camera:
    def __init__(self, points):
        lo = [min(p[i] for p in points) for i in range(3)]
        hi = [max(p[i] for p in points) for i in range(3)]
        self.target = tuple((lo[i] + hi[i]) / 2 for i in range(3))
        size = math.sqrt(dot(sub(hi, lo), sub(hi, lo)))
        self.back = normalize(VIEW_DIRECTION)
        self.eye = tuple(self.target[i] + self.back[i] * size * CAMERA_DISTANCE for i in range(3))
        self.right = normalize(cross((0.0, 1.0, 0.0), self.back))
        self.up = cross(self.back, self.right)

    def project(self, p):
        """Return (x, y, 1/depth) on a plane one unit in front of the eye, y pointing down."""
        v = sub(p, self.eye)
        depth = -dot(v, self.back)
        return (dot(v, self.right) / depth, -dot(v, self.up) / depth, 1.0 / depth)


def fill(polygon, w, h, plot):
    """Scanline-fill a convex polygon, calling plot(x, y, inv_depth) at each covered pixel center."""
    (x0, y0, q0), (x1, y1, q1), (x2, y2, q2) = polygon[0], polygon[1], polygon[2]
    det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if det == 0:
        return
    # 1/depth is affine in screen space for a planar polygon
    qa = ((q1 - q0) * (y2 - y0) - (q2 - q0) * (y1 - y0)) / det
    qb = ((x1 - x0) * (q2 - q0) - (x2 - x0) * (q1 - q0)) / det
    qc = q0 - qa * x0 - qb * y0
    ys = [p[1] for p in polygon]
    for py in range(max(0, math.ceil(min(ys) - 0.5)), min(h, math.ceil(max(ys) - 0.5))):
        yc = py + 0.5
        xs = []
        for (ax, ay, _), (bx, by, _) in zip(polygon, polygon[1:] + polygon[:1]):
            if (ay <= yc < by) or (by <= yc < ay):
                xs.append(ax + (yc - ay) * (bx - ax) / (by - ay))
        if len(xs) < 2:
            continue
        for px in range(max(0, math.ceil(min(xs) - 0.5)), min(w, math.ceil(max(xs) - 0.5))):
            plot(px, py, qa * (px + 0.5) + qb * yc + qc)


def box_blur(plane, w, h, x0, y0, x1, y1, radius):
    """Blur plane[y * w + x] in place inside the box [x0, x1) x [y0, y1), rows then columns."""
    n = 2 * radius + 1
    for y in range(y0, y1):
        row = [plane[y * w + x] for x in range(x0, x1)]
        for x in range(x0, x1):
            lo, hi = max(0, x - x0 - radius), min(len(row), x - x0 + radius + 1)
            plane[y * w + x] = sum(row[lo:hi]) / n
    for x in range(x0, x1):
        col = [plane[y * w + x] for y in range(y0, y1)]
        for y in range(y0, y1):
            lo, hi = max(0, y - y0 - radius), min(len(col), y - y0 + radius + 1)
            plane[y * w + x] = sum(col[lo:hi]) / n


def add_bloom(planes, body, source, config, width, height):
    """Blur the emissive samples in source (supersampled index -> rgb) and add them to planes."""
    w, n = width * SUPERSAMPLE, SUPERSAMPLE * SUPERSAMPLE
    bloom = [[0.0] * (width * height) for _ in range(4)]
    rows, cols = [], []
    for i, rgb in source.items():
        oy, ox = i // w // SUPERSAMPLE, (i % w) // SUPERSAMPLE
        rows.append(oy)
        cols.append(ox)
        o = oy * width + ox
        for c in range(3):
            bloom[c][o] += rgb[c] / n
        bloom[3][o] += 1.0 / n
    # Only blur the box the bloom can reach, which keeps this fast in pure Python
    reach = BLOOM_RADIUS * BLOOM_PASSES
    x0, x1 = max(0, min(cols) - reach), min(width, max(cols) + reach + 1)
    y0, y1 = max(0, min(rows) - reach), min(height, max(rows) + reach + 1)
    for plane in bloom:
        for _ in range(BLOOM_PASSES):
            box_blur(plane, width, height, x0, y0, x1, y1, BLOOM_RADIUS)
    for y in range(y0, y1):
        for x in range(x0, x1):
            o = y * width + x
            k = config["strength"] * (1.0 - body[o] if config["through_body"] else 1.0)
            for c in range(4):
                planes[c][o] += bloom[c][o] * k


def rasterize(polygons, layers, to_screen, width=WIDTH, height=HEIGHT, background=None, bloom=True):
    w, h = width * SUPERSAMPLE, height * SUPERSAMPLE

    # Premultiplied (r, g, b, a) under the vehicle: the shadow and light pools, laid over an
    # opaque background when one is given
    ground = [None] * (w * h) if background is None else background
    for quad, alpha, rgb in layers:

        def lay(px, py, _, alpha=alpha, rgb=rgb):
            i = py * w + px
            r, g, b, a = ground[i] or (0.0, 0.0, 0.0, 0.0)
            ground[i] = (r + rgb[0] * alpha, g + rgb[1] * alpha, b + rgb[2] * alpha, a + alpha)

        fill(to_screen(quad), w, h, lay)

    depth = [0.0] * (w * h)  # stores 1/depth, so larger is nearer and 0 is empty
    color = [None] * (w * h)
    for quad, rgb, _ in polygons:

        def paint(px, py, q, rgb=rgb):
            i = py * w + px
            if q > depth[i]:
                depth[i] = q
                color[i] = rgb

        fill(to_screen(quad), w, h, paint)

    # Average each SUPERSAMPLE x SUPERSAMPLE block with premultiplied alpha
    n = SUPERSAMPLE * SUPERSAMPLE
    planes = [[0.0] * (width * height) for _ in range(4)]
    body = [0.0] * (width * height)  # fraction of each output pixel the vehicle covers
    for oy in range(height):
        for ox in range(width):
            r = g = b = a = 0.0
            covered = 0
            for sy in range(oy * SUPERSAMPLE, (oy + 1) * SUPERSAMPLE):
                for sx in range(ox * SUPERSAMPLE, (ox + 1) * SUPERSAMPLE):
                    i = sy * w + sx
                    if color[i] is not None:
                        r, g, b, a = r + color[i][0], g + color[i][1], b + color[i][2], a + 1.0
                        covered += 1
                    elif ground[i] is not None:
                        gr, gg, gb, ga = ground[i]
                        k = min(1.0, ga) / ga
                        r, g, b, a = r + gr * k, g + gg * k, b + gb * k, a + ga * k
            o = oy * width + ox
            planes[0][o], planes[1][o], planes[2][o], planes[3][o] = r / n, g / n, b / n, a / n
            body[o] = covered / n

    for group, config in (BLOOM.items() if bloom else []):
        source = {}
        for quad, rgb, emissive in polygons:
            if emissive != group:
                continue

            def light(px, py, q, rgb=rgb, through=config["through_body"]):
                i = py * w + px
                if through or q >= depth[i]:
                    source[i] = rgb

            fill(to_screen(quad), w, h, light)
        if source:
            add_bloom(planes, body, source, config, width, height)

    out = bytearray(width * height * 4)
    for o in range(width * height):
        a = planes[3][o]
        if a > 0:
            out[o * 4 : o * 4 + 4] = bytes(
                (*(min(255, round(planes[c][o] / a)) for c in range(3)), min(255, round(255 * a)))
            )
    return out


def render(rp, icons=False):
    geo = json.loads((rp / GEOMETRY).read_text())["minecraft:geometry"][0]
    texture = read_png(rp / TEXTURE)
    animations = json.loads((rp / ANIMATIONS).read_text())
    folds = folded_wheels(animations)
    turns = submerged_parts(animations)

    scenes = {name: collect(geo, texture, folds, turns, pose) for name, pose in POSES.items()}
    ground_y = min(p[1] for quad, _, _ in scenes["suv-front-left.png"] for p in quad)
    layers = {name: ground_layers(scenes[name], pose, ground_y) for name, pose in POSES.items()}

    # One camera and one scale for every pose, so the vehicle has the same size in each picture
    camera = Camera([p for polygons in scenes.values() for quad, _, _ in polygons for p in quad])
    projected = [
        camera.project(p)
        for name in POSES
        for quad in [q for q, _, _ in scenes[name]] + [q for q, _, _ in layers[name]]
        for p in quad
    ]
    sx_lo, sx_hi = min(p[0] for p in projected), max(p[0] for p in projected)
    sy_lo, sy_hi = min(p[1] for p in projected), max(p[1] for p in projected)
    w, h = WIDTH * SUPERSAMPLE, HEIGHT * SUPERSAMPLE
    scale = min(w * (1 - 2 * MARGIN) / (sx_hi - sx_lo), h * (1 - 2 * MARGIN) / (sy_hi - sy_lo))
    off_x = w / 2 - scale * (sx_lo + sx_hi) / 2
    off_y = h / 2 - scale * (sy_lo + sy_hi) / 2

    def to_screen(quad):
        return [(off_x + scale * x, off_y + scale * y, q) for x, y, q in map(camera.project, quad)]

    images = {name: rasterize(scenes[name], layers[name], to_screen) for name in POSES}
    icon = None
    if icons:
        pose = {**POSES["suv-flying.png"], "lamps": True, "icon": True}
        polygons = collect(geo, texture, folds, turns, pose)
        icon = render_icon(geo, polygons, camera)
    return images, icon


def render_icon(geo, polygons, camera):
    """Fit the flying vehicle to 80% width; composite radial wheel discs behind its faces."""
    size = ICON_SIZE
    w = h = size * SUPERSAMPLE
    projected = [camera.project(p) for quad, _, _ in polygons for p in quad]
    xlo, xhi = min(p[0] for p in projected), max(p[0] for p in projected)
    ylo, yhi = min(p[1] for p in projected), max(p[1] for p in projected)
    scale = w * ICON_FILL / (xhi - xlo)
    off_x = w / 2 - scale * (xlo + xhi) / 2
    off_y = h / 2 - scale * (ylo + yhi) / 2

    def to_screen(quad):
        return [(off_x + scale * x, off_y + scale * y, q) for x, y, q in map(camera.project, quad)]

    background = [
        (*(ICON_BAND_COLOR if abs((y + 0.5) - (h - (x + 0.5) * 0.5)) < h * ICON_BAND_HEIGHT / 2 else ICON_BACKGROUND), 1.0)
        for y in range(h) for x in range(w)
    ]
    bones = {bone["name"]: bone for bone in geo["bones"]}
    for name, bone in bones.items():
        if not name.startswith("glow_"):
            continue
        cube = bone["cubes"][0]
        origin, extent = cube["origin"], cube["size"]
        cx, cy, cz = -(origin[0] + extent[0] / 2), origin[1] + FLIGHT_LIFT, origin[2] + extent[2] / 2
        wheel = bones[name.replace("glow_", "wheel_")]
        # The tire is a ring of rotated cubes, so its radius is the farthest rotated corner from the hub
        hub = wheel["pivot"]
        wheel_radius = math.sqrt(max(
            (p[1] - hub[1]) ** 2 + (p[2] - hub[2]) ** 2
            for c in wheel["cubes"]
            for _, face in cube_faces(c)
            for p in face
        ))
        # A flat circle on screen rather than a disc lying under the wheel: seen from above, a
        # horizontal disc would hide behind the folded wheel and leave only a thin rim of glow.
        (sx, sy, inv_depth), = to_screen([(cx, cy, cz)])
        radius = wheel_radius * GLOW_DISC_REACH * scale * inv_depth
        x0, x1 = max(0, math.ceil(sx - radius - 0.5)), min(w, math.ceil(sx + radius - 0.5))
        y0, y1 = max(0, math.ceil(sy - radius - 0.5)), min(h, math.ceil(sy + radius - 0.5))
        for py in range(y0, y1):
            for px in range(x0, x1):
                dx, dy = px + 0.5 - sx, py + 0.5 - sy
                alpha = GLOW_DISC_ALPHA * max(0.0, 1.0 - math.sqrt(dx * dx + dy * dy) / radius)
                if alpha:
                    i = py * w + px
                    background[i] = (*(background[i][c] * (1 - alpha) + GLOW_DISC_COLOR[c] * alpha for c in range(3)), 1.0)
    # Bloom would wash the lamp and disc halos over the orange band and blur the small icon.
    return rasterize(polygons, [], to_screen, size, size, background, bloom=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--icons", nargs="+", type=Path, default=[])
    args = parser.parse_args()
    images, icon = render(args.resource_pack, bool(args.icons))
    targets = [(args.output_dir / name, WIDTH, HEIGHT, pixels, False) for name, pixels in images.items()]
    for pack in args.icons:
        pixels = icon
        if pack.name == ICON_GRAYSCALE_PACK:
            pixels = bytearray(icon)
            for i in range(0, len(pixels), 4):
                # Integer Rec. 601 luminance keeps grayscale generation deterministic.
                gray = (299 * pixels[i] + 587 * pixels[i + 1] + 114 * pixels[i + 2] + 500) // 1000
                pixels[i:i + 3] = bytes((gray, gray, gray))
        targets.append((pack / "pack_icon.png", ICON_SIZE, ICON_SIZE, pixels, True))
    stale = []
    for target, width, height, pixels, rgb in targets:
        if args.check:
            try:
                current = bytes(c for row in read_png(target) for px in row for c in px)
            except (OSError, ValueError, struct.error, zlib.error):
                current = b""
            if current != bytes(pixels):
                stale.append(str(target))
        else:
            write_png(target, width, height, pixels, rgb=rgb)
            print(f"wrote {target}")
    if stale:
        sys.exit(f"{', '.join(stale)} out of date with the model. Run `pnpm model` and commit the result.")
    if args.check:
        print("previews and requested icons are up to date")


if __name__ == "__main__":
    main()
