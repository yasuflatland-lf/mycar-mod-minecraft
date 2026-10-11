"""Render the README preview of the vehicle model from its front-left corner.

    python3 -I tools/render_preview.py <resource pack> <output png>          write the image
    python3 -I tools/render_preview.py <resource pack> <output png> --check  fail if it is stale

Only the standard library is used, like gen_model.py. The arithmetic avoids math.sin/cos (their
last bit can differ between platforms' libm) so the same model renders to the same pixels on a Mac
and on the Linux CI runner. --check compares decoded pixels rather than PNG bytes, because zlib
builds do not all compress identically.
"""
import json
import math
import struct
import sys
import zlib
from pathlib import Path

GEOMETRY = "models/entity/suv.geo.json"
TEXTURE = "textures/entity/suv.png"
WIDTH, HEIGHT = 960, 560
SUPERSAMPLE = 3
MARGIN = 0.06  # fraction of the image kept empty around the vehicle

# Seen from the vehicle's front-left at 45 degrees, about 25 degrees above the ground.
VIEW_DIRECTION = (-1.0, 0.65, -1.0)
CAMERA_DISTANCE = 6.0  # in multiples of the model's size; far enough to keep perspective mild

# Minecraft's fixed face shading: top faces full brightness, north/south 0.8, east/west 0.6, bottom 0.5.
SHADE_UP, SHADE_DOWN, SHADE_Z, SHADE_X = 1.0, 0.5, 0.8, 0.6

SHADOW_LAYERS = 12
SHADOW_ALPHA = 0.025  # per layer, so the center of the shadow is 0.3
SHADOW_GROWTH = 0.5  # pixels (model units) added around the footprint per layer


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


def write_png(path, w, h, pixels):
    raw = b"".join(b"\x00" + bytes(pixels[y * w * 4 : (y + 1) * w * 4]) for y in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
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
        # Bedrock geometry is mirrored on x compared with the world: the steering wheel at the model's
        # -x shows up on the right in game. Flipping x here makes the picture match the game.
        yield name, [(-px, py, pz) for px, py, pz in (rotate(p, pivot, rotation) for p in quad)]


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


def collect(geo, texture):
    desc = geo["description"]
    polygons = []
    for bone in geo["bones"]:
        for cube in bone.get("cubes", []):
            for name, quad in cube_faces(cube):
                normal = cross(sub(quad[1], quad[0]), sub(quad[3], quad[0]))
                if dot(normal, normal) == 0:
                    continue
                r, g, b, _ = face_color(texture, cube["uv"][name], desc["texture_width"], desc["texture_height"])
                k = shade(normalize(normal))
                polygons.append((quad, (r * k, g * k, b * k)))
    return polygons


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


def render(rp):
    geo = json.loads((rp / GEOMETRY).read_text())["minecraft:geometry"][0]
    polygons = collect(geo, read_png(rp / TEXTURE))
    points = [p for quad, _ in polygons for p in quad]
    camera = Camera(points)

    ground_y = min(p[1] for p in points)
    x_lo, x_hi = min(p[0] for p in points), max(p[0] for p in points)
    z_lo, z_hi = min(p[2] for p in points), max(p[2] for p in points)
    shadows = []
    for layer in range(SHADOW_LAYERS):
        g = layer * SHADOW_GROWTH
        shadows.append([(x_lo - g, ground_y, z_lo - g), (x_hi + g, ground_y, z_lo - g), (x_hi + g, ground_y, z_hi + g), (x_lo - g, ground_y, z_hi + g)])

    # Fit everything, shadow included, into the image with a margin on every side
    projected = [camera.project(p) for p in points + [p for quad in shadows for p in quad]]
    sx_lo, sx_hi = min(p[0] for p in projected), max(p[0] for p in projected)
    sy_lo, sy_hi = min(p[1] for p in projected), max(p[1] for p in projected)
    w, h = WIDTH * SUPERSAMPLE, HEIGHT * SUPERSAMPLE
    scale = min(w * (1 - 2 * MARGIN) / (sx_hi - sx_lo), h * (1 - 2 * MARGIN) / (sy_hi - sy_lo))
    off_x = w / 2 - scale * (sx_lo + sx_hi) / 2
    off_y = h / 2 - scale * (sy_lo + sy_hi) / 2

    def to_screen(quad):
        return [(off_x + scale * x, off_y + scale * y, q) for x, y, q in map(camera.project, quad)]

    shadow = [0.0] * (w * h)
    for quad in shadows:

        def darken(px, py, _):
            shadow[py * w + px] += SHADOW_ALPHA

        fill(to_screen(quad), w, h, darken)

    depth = [0.0] * (w * h)  # stores 1/depth, so larger is nearer and 0 is empty
    color = [None] * (w * h)
    for quad, rgb in polygons:

        def paint(px, py, q, rgb=rgb):
            i = py * w + px
            if q > depth[i]:
                depth[i] = q
                color[i] = rgb

        fill(to_screen(quad), w, h, paint)

    # Average each SUPERSAMPLE x SUPERSAMPLE block with premultiplied alpha
    out = bytearray(WIDTH * HEIGHT * 4)
    n = SUPERSAMPLE * SUPERSAMPLE
    for oy in range(HEIGHT):
        for ox in range(WIDTH):
            r = g = b = a = 0.0
            for sy in range(oy * SUPERSAMPLE, (oy + 1) * SUPERSAMPLE):
                for sx in range(ox * SUPERSAMPLE, (ox + 1) * SUPERSAMPLE):
                    i = sy * w + sx
                    if color[i] is not None:
                        r, g, b, a = r + color[i][0], g + color[i][1], b + color[i][2], a + 1.0
                    else:
                        a += shadow[i]  # black, so it only adds coverage
            o = (oy * WIDTH + ox) * 4
            if a > 0:
                out[o : o + 4] = bytes((round(r / a), round(g / a), round(b / a), round(255 * a / n)))
    return out


def main():
    rp, target = Path(sys.argv[1]), Path(sys.argv[2])
    pixels = render(rp)
    if "--check" in sys.argv[3:]:
        current = bytes(c for row in read_png(target) for px in row for c in px) if target.exists() else b""
        if current != bytes(pixels):
            sys.exit(f"{target} is out of date with the model. Run `pnpm model` and commit the result.")
        print(f"{target} is up to date")
        return
    write_png(target, WIDTH, HEIGHT, pixels)
    print(f"wrote {target}")


main()
