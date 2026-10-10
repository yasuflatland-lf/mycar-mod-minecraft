// Look ahead and decide whether to jump when nearing a two-block step (ADR 0004).
import { SPEC } from "./spec";

export type SolidAt = (ahead: number, side: number, dy: number) => boolean;

/** The 3 look-ahead rays (center, left, right; a positive side is the vehicle's right). */
export const STEP_LANES: readonly number[] = [
  0,
  -SPEC.stepLaneOffset,
  SPEC.stepLaneOffset,
];

const STEP_HEIGHT = 2;

// Block centers the vehicle would occupy standing on a two-block step, so the
// clearance check follows SPEC.carHeight (1.6 gives 2.5 and 3.5).
const CLEARANCE_PROBES: readonly number[] = Array.from(
  { length: Math.ceil(SPEC.carHeight) },
  (_, i) => STEP_HEIGHT + i + 0.5,
);

// The first block above the vehicle's roof where it stands now.
const OVERHEAD_PROBE = Math.ceil(SPEC.carHeight) + 0.5;

export function shouldStepUp(solid: SolidAt, speed: number): boolean {
  if (solid(0, 0, OVERHEAD_PROBE)) return false; // Blocked overhead
  const lookahead = speed * SPEC.stepLookaheadTicks + SPEC.stepLookaheadMargin;
  const from = SPEC.hitboxFront + 0.1;
  // The epsilon keeps the last scan point despite floating-point accumulation in `d`.
  const to = SPEC.hitboxFront + lookahead + 1e-9;
  for (let d = from; d <= to; d += SPEC.stepScanStep) {
    let twoStep = false;
    for (const side of STEP_LANES) {
      if (!solid(d, side, 0.5)) continue; // No obstacle on this ray yet
      // A step of height 3 or more, or one without room above it for the
      // vehicle, is a wall: stop scanning.
      if (CLEARANCE_PROBES.some((dy) => solid(d, side, dy))) return false;
      if (solid(d, side, 1.5)) twoStep = true; // Leave height 1 to the engine
    }
    if (twoStep) return true;
  }
  return false;
}
