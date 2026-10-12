// Seat assignment and dismount detection (ADR 0019).
import { dot, leftOf, type Vec2 } from "../shared/vec";
import type { SeatLayout } from "./profile";

/** Converts a world-space offset into seat coordinates for a vehicle facing `f`. */
export function toLocal(offset: Vec2, f: Vec2): Vec2 {
  return { x: dot(offset, leftOf(f)), z: dot(offset, f) };
}

export function nearestSeat(
  local: Vec2,
  positions: SeatLayout["positions"],
): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [i, seat] of positions.entries()) {
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
  positions: SeatLayout["positions"],
): Map<string, number> {
  return new Map(
    riders.map((r) => [r.id, nearestSeat(toLocal(r.offset, f), positions)]),
  );
}

export function vacatedSeats(
  prev: ReadonlyMap<string, number>,
  now: ReadonlyMap<string, number>,
): number[] {
  return [...prev].filter(([id]) => !now.has(id)).map(([, seat]) => seat);
}
