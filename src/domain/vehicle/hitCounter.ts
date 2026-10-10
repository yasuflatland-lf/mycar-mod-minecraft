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
  counter: HitCounter,
  tick: number,
  hasRiders: boolean,
): { counter: HitCounter; broken: boolean } {
  if (hasRiders) return { counter, broken: false };
  const isStale = tick - counter.lastTick > SPEC.hitResetTicks;
  const count = (isStale ? 0 : counter.count) + 1;
  if (count >= SPEC.hitsToBreak) {
    return { counter: EMPTY_COUNTER, broken: true };
  }
  return { counter: { count, lastTick: tick }, broken: false };
}
