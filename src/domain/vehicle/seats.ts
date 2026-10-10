// src/domain/vehicle/seats.ts
// 座席の判定と降車の検出 (ADR 0007)。座席の位置は packs/mycar_bp/entities/suv.json の minecraft:rideable と一致させる。
import { dot, leftOf, type Vec2 } from "../shared/vec";

/** 車の向きに合わせた座標 (x = 左、z = 前)。0 = 運転席 (右前)、1 = 助手席、2 = 運転席の後ろ、3 = 助手席の後ろ。 */
export const SEAT_POSITIONS: readonly Vec2[] = [
  { x: -0.38, z: 0.35 },
  { x: 0.38, z: 0.35 },
  { x: -0.38, z: -0.8 },
  { x: 0.38, z: -0.8 },
];

/** 座席ごとのドアのボーン名 (ADR 0009)。 */
export const DOOR_BY_SEAT: readonly string[] = [
  "door_fr",
  "door_fl",
  "door_rr",
  "door_rl",
];

export const toLocal = (offset: Vec2, f: Vec2): Vec2 => ({
  x: dot(offset, leftOf(f)),
  z: dot(offset, f),
});

export function nearestSeat(local: Vec2): number {
  let best = 0;
  let bestDist = Infinity;
  SEAT_POSITIONS.forEach((s, i) => {
    const d = Math.hypot(local.x - s.x, local.z - s.z);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

export interface RiderPos {
  id: string;
  offset: Vec2;
}

export function occupiedSeats(
  riders: readonly RiderPos[],
  f: Vec2,
): Map<string, number> {
  return new Map(riders.map((r) => [r.id, nearestSeat(toLocal(r.offset, f))]));
}

export function vacatedSeats(
  prev: ReadonlyMap<string, number>,
  now: ReadonlyMap<string, number>,
): number[] {
  return [...prev].filter(([id]) => !now.has(id)).map(([, seat]) => seat);
}
