"""THROWAWAY spike: 4 ドアのオフロード SUV の仮モデルとテクスチャを生成する。

座標はピクセル (16 px = 1 ブロック)。下の定義は「前方 +z、左 +x」で書き、書き出す直前に
Y 軸まわりに 180° 回す。Bedrock ではエンティティの正面がモデルの -z 側になるため。
ボーン名は規約どおり: root / body / wheel_fl / wheel_fr / wheel_rl / wheel_rr / seat_0..3。
"""
import json
import struct
import sys
import zlib
from pathlib import Path

RP = Path(sys.argv[1])

# 色見本。各色を 4x4 のマスに置き、面の UV はマスの中央 2x2 を指す
PALETTE = {
    "body": (142, 128, 88),  # カーキ
    "trim": (58, 58, 60),
    "grille": (14, 14, 14),
    "tire": (20, 20, 20),
    "rim": (176, 176, 180),
    "seat": (45, 43, 42),
    "light": (232, 232, 208),
    "tail": (170, 30, 30),
    "glass": (40, 52, 60),
    "gauge": (225, 225, 215),
}
NAMES = list(PALETTE)


def uv(color):
    i = NAMES.index(color)
    face = {"uv": [i * 4 + 1, 1], "uv_size": [2, 2]}
    return {k: dict(face) for k in ("north", "south", "east", "west", "up", "down")}


def box(x0, y0, z0, x1, y1, z1, color):
    return {"origin": [x0, y0, z0], "size": [x1 - x0, y1 - y0, z1 - z0], "uv": uv(color)}


body = [
    # シャシーと床
    box(-13, 4, -24, 13, 7, 24, "trim"),
    # ボンネット (エンジン部)
    box(-13, 7, 13, 13, 17, 25, "body"),
    # フロントバンパー
    box(-15, 3, 25, 15, 7, 28, "trim"),
    # グリル (縦スロット 6 本 + 枠)
    box(-8, 8, 25, 8, 9, 26, "body"),
    box(-8, 15, 25, 8, 16, 26, "body"),
    *[box(-8 + i * 3, 9, 25, -7 + i * 3, 15, 26, "body") for i in range(6)],
    box(-7, 9, 25.5, 8, 15, 26, "grille"),
    # 丸目ヘッドライト (近似)
    box(-12, 10, 25, -9, 14, 26, "light"),
    box(9, 10, 25, 12, 14, 26, "light"),
    # ダッシュボード
    box(-12, 13, 10, 12, 17, 13, "trim"),
    # フロントガラスの下枠と A ピラー
    box(-12, 17, 12.5, 12, 18, 13, "trim"),
    box(-13, 17, 12, -12, 30, 13, "body"),
    box(12, 17, 12, 13, 30, 13, "body"),
    # ルームミラー (フロントガラス上端の中央)
    box(-0.5, 27, 11.5, 0.5, 29, 12, "trim"),
    box(-2.5, 25.5, 11, 2.5, 27, 11.5, "rim"),
    # サイドミラー (ドア前端、窓の高さで外へ張り出す)
    box(13, 17, 10, 14, 18, 11, "body"),
    box(14, 16.5, 9.5, 16.5, 19.5, 11, "body"),
    box(14.2, 17, 9.3, 16.3, 19, 9.5, "rim"),
    box(-14, 17, 10, -13, 18, 11, "body"),
    box(-16.5, 16.5, 9.5, -14, 19.5, 11, "body"),
    box(-16.3, 17, 9.3, -14.2, 19, 9.5, "rim"),
    # 屋根
    box(-13, 29, -25, 13, 30, 13, "body"),
    # ドア (左右、窓の下まで)
    box(12, 7, -22, 13, 17, 12, "body"),
    box(-13, 7, -22, -12, 17, 12, "body"),
    # B ピラー / C ピラー (左右)
    box(12, 17, -6, 13, 29, -5, "body"),
    box(-13, 17, -6, -12, 29, -5, "body"),
    box(12, 7, -25, 13, 29, -22, "body"),
    box(-13, 7, -25, -12, 29, -22, "body"),
    # 背面 (テールゲート + 上部の枠)
    box(-13, 7, -26, 13, 17, -25, "body"),
    box(-13, 27, -26, 13, 29, -25, "body"),
    box(12, 9, -26.2, 13, 13, -25.8, "tail"),
    box(-13, 9, -26.2, -12, 13, -25.8, "tail"),
    # 背面のスペアタイヤ
    box(-5, 9, -29, 5, 19, -26, "tire"),
    box(-2, 12, -29.3, 2, 16, -29, "rim"),
    # フェンダー (オーバーフェンダー)
    box(13, 12, 10, 16, 14, 24, "trim"),
    box(-16, 12, 10, -13, 14, 24, "trim"),
    box(13, 12, -23, 16, 14, -9, "trim"),
    box(-16, 12, -23, -13, 14, -9, "trim"),
    # ステップ
    box(13, 4, -9, 15, 6, 10, "trim"),
    box(-15, 4, -9, -13, 6, 10, "trim"),
    # 座席 (前 2 + 後ろのベンチ)
    box(2, 7, 1, 11, 10, 9, "seat"),
    box(2, 10, 0, 11, 19, 1, "seat"),
    box(-11, 7, 1, -2, 10, 9, "seat"),
    box(-11, 10, 0, -2, 19, 1, "seat"),
    box(-11, 7, -17, 11, 10, -9, "seat"),
    box(-11, 10, -18, 11, 19, -17, "seat"),
]

# ハンドル (+x 側。ゲーム内では右ハンドルとして表示される)。運転者側へ 20° 傾けた輪で、車内の暗さに埋もれないよう明るい灰色にする
WHEEL_PIVOT = [6, 18.5, 9.5]


def tilted(cube):
    cube["pivot"] = WHEEL_PIVOT
    cube["rotation"] = [-20, 0, 0]
    return cube


steering = [
    tilted(box(2.5, 21, 9, 9.5, 22, 10, "rim")),  # 上
    tilted(box(2.5, 15, 9, 9.5, 16, 10, "rim")),  # 下
    tilted(box(2.5, 16, 9, 3.5, 21, 10, "rim")),  # 右
    tilted(box(8.5, 16, 9, 9.5, 21, 10, "rim")),  # 左
    tilted(box(5, 17.5, 9.2, 7, 19.5, 10.2, "trim")),  # 中心
    tilted(box(5.5, 18, 10.2, 6.5, 19, 11, "trim")),  # コラム
]
body += steering

# メーター (ハンドルの奥、ダッシュボードの運転者側の面)。丸目 2 つ + 赤い針
body += [
    box(2.5, 16.8, 10, 9.5, 19.8, 10.6, "grille"),  # メーターの縁
    box(3, 17.2, 9.9, 5.6, 19.4, 10, "gauge"),  # 速度計
    box(6.4, 17.2, 9.9, 9, 19.4, 10, "gauge"),  # 回転計
    box(4.2, 18.0, 9.8, 4.4, 19.2, 9.9, "tail"),  # 針
    box(7.6, 18.0, 9.8, 7.8, 19.2, 9.9, "tail"),  # 針
]

# センターコンソールとシフトレバー (前席の間)
body += [
    box(-1.5, 7, 1, 1.5, 11, 10, "trim"),  # コンソール
    box(-0.75, 11, 5, 0.75, 11.5, 6.5, "grille"),  # ブーツ
    box(-0.25, 11.5, 5.5, 0.25, 14, 6, "rim"),  # レバー
    box(-0.75, 14, 5.25, 0.75, 15, 6.25, "grille"),  # ノブ
]


def wheel(name, x_out, z_center):
    # x_out: 外側に向かう符号 (+1 = 左, -1 = 右)
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
                "identifier": "geometry.spike_car",
                "texture_width": 64,
                "texture_height": 16,
                "visible_bounds_width": 5,
                "visible_bounds_height": 3,
                "visible_bounds_offset": [0, 1, 0],
            },
            "bones": [
                {"name": "root", "pivot": [0, 0, 0]},
                {"name": "body", "parent": "root", "pivot": [0, 7, 0], "cubes": body},
                wheel("wheel_fl", +1, 17),
                wheel("wheel_fr", -1, 17),
                wheel("wheel_rl", +1, -16),
                wheel("wheel_rr", -1, -16),
                {"name": "seat_0", "parent": "body", "pivot": [6, 10, 2]},
                {"name": "seat_1", "parent": "body", "pivot": [-6, 10, 2]},
                {"name": "seat_2", "parent": "body", "pivot": [6, 10, -17]},
                {"name": "seat_3", "parent": "body", "pivot": [-6, 10, -17]},
            ],
        }
    ],
}


def turn_around(bones):
    """Y 軸まわりに 180° 回す (x, z を反転)。"""
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
            # 面の向きも入れ替わる (north <-> south, east <-> west)。単色なので UV はそのままでよい


turn_around(geo["minecraft:geometry"][0]["bones"])
(RP / "models/entity/spike_car.geo.json").write_text(json.dumps(geo, indent=1))


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


png(RP / "textures/entity/spike_car_script.png", 64, 16, pixel_for(PALETTE["body"]))
png(RP / "textures/entity/spike_car_horse.png", 64, 16, pixel_for((40, 70, 140)))
print("cubes:", len(body) + 12)
