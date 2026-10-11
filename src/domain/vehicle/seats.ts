// Seat assignment and dismount detection (ADR 0019). Seat positions must match minecraft:rideable in packs/mycar_bp/entities/suv.json.
import { dot, leftOf, type Vec2 } from "../shared/vec";

/** Coordinates aligned with the vehicle's facing (x = left, z = forward). 0 = driver's seat (front right), 1 = front passenger seat, 2 = behind the driver, 3 = behind the front passenger. */
export const SEAT_POSITIONS: readonly Vec2[] = [
  { x: -0.38, z: 0.35 },
  { x: 0.38, z: 0.35 },
  { x: -0.38, z: -0.8 },
  { x: 0.38, z: -0.8 },
];

/** Door bone name for each seat (ADR 0009). */
export const DOOR_BY_SEAT: readonly string[] = [
  "door_fr",
  "door_fl",
  "door_rr",
  "door_rl",
];

export function doorOf(seat: number): string {
  const door = DOOR_BY_SEAT[seat];
  if (door === undefined) throw new RangeError(`No door for seat ${seat}`);
  return door;
}

/** Converts a world-space offset into seat coordinates for a vehicle facing `f`. */
export function toLocal(offset: Vec2, f: Vec2): Vec2 {
  return { x: dot(offset, leftOf(f)), z: dot(offset, f) };
}

export function nearestSeat(local: Vec2): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [i, seat] of SEAT_POSITIONS.entries()) {
    const dist = Math.hypot(local.x - seat.x, local.z - seat.z);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
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
