// src/domain/vehicle/hitCounter.ts
// Counts how many times the vehicle is hit and decides whether it breaks (ADR 0008).
import { SPEC } from "./spec";

export interface HitCounter {
  count: number;
  lastTick: number;
}
export const EMPTY_COUNTER: HitCounter = {
  count: 0,
  lastTick: Number.NEGATIVE_INFINITY,
};

export function registerHit(
  c: HitCounter,
  tick: number,
  hasRiders: boolean,
): { counter: HitCounter; broken: boolean } {
  if (hasRiders) return { counter: c, broken: false }; // Hits are not counted while there are occupants
  const base = tick - c.lastTick > SPEC.hitResetTicks ? 0 : c.count;
  const count = base + 1;
  if (count >= SPEC.hitsToBreak)
    return { counter: EMPTY_COUNTER, broken: true };
  return { counter: { count, lastTick: tick }, broken: false };
}
