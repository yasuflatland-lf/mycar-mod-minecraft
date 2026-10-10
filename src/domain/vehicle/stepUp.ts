// src/domain/vehicle/stepUp.ts
// Look ahead and decide whether to jump when nearing a two-block step (ADR 0004).
import { SPEC } from "./spec";

export type SolidAt = (ahead: number, side: number, dy: number) => boolean;

/** The 3 look-ahead rays (center, right, left). */
export const STEP_LANES: readonly number[] = [
  0,
  -SPEC.stepLaneOffset,
  SPEC.stepLaneOffset,
];

export function shouldStepUp(solid: SolidAt, speed: number): boolean {
  if (solid(0, 0, 2.5)) return false; // Blocked overhead
  const lookahead = speed * SPEC.stepLookaheadTicks + SPEC.stepLookaheadMargin;
  const from = SPEC.hitboxFront + 0.1;
  const to = SPEC.hitboxFront + lookahead + 1e-9;
  for (let d = from; d <= to; d += SPEC.stepScanStep) {
    let twoStep = false;
    for (const side of STEP_LANES) {
      if (!solid(d, side, 0.5)) continue; // No obstacle on this ray yet
      // Height 3 or more, or no room for the vehicle (height 1.6) above the step: treat as a wall and stop
      if (solid(d, side, 2.5) || solid(d, side, 3.5)) return false;
      if (solid(d, side, 1.5)) twoStep = true; // Leave height 1 to the engine
    }
    if (twoStep) return true;
  }
  return false;
}
