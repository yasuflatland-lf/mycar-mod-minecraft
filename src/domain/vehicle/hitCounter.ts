// src/domain/vehicle/hitCounter.ts
// 車を殴った回数を数え、壊れるかを決める (ADR 0008)。
import { SPEC } from "./spec";

export interface HitCounter { count: number; lastTick: number }
export const EMPTY_COUNTER: HitCounter = { count: 0, lastTick: Number.NEGATIVE_INFINITY };

export function registerHit(c: HitCounter, tick: number, hasRiders: boolean): { counter: HitCounter; broken: boolean } {
  if (hasRiders) return { counter: c, broken: false }; // 乗員がいる間は数えない
  const base = tick - c.lastTick > SPEC.hitResetTicks ? 0 : c.count;
  const count = base + 1;
  if (count >= SPEC.hitsToBreak) return { counter: EMPTY_COUNTER, broken: true };
  return { counter: { count, lastTick: tick }, broken: false };
}
