// Look ahead and decide whether to jump when nearing a one- or two-block step (ADR 0004, 0035).
import { SPEC } from "./spec";

export type SolidAt = (ahead: number, side: number, dy: number) => boolean;

/** The 3 look-ahead rays (center, left, right; a positive side is the vehicle's right). */
export const STEP_LANES: readonly number[] = [
  0,
  -SPEC.stepLaneOffset,
  SPEC.stepLaneOffset,
];

// Block centers the vehicle would occupy standing on a step of `height`, so
// the clearance check follows SPEC.carHeight (1.6 gives height + 0.5 and
// height + 1.5).
function clearanceProbes(height: number): number[] {
  return Array.from(
    { length: Math.ceil(SPEC.carHeight) },
    (_, i) => height + i + 0.5,
  );
}

// The first block above the vehicle's roof where it stands now.
const OVERHEAD_PROBE = Math.ceil(SPEC.carHeight) + 0.5;

/**
 * Height of the step to jump onto now: 0 for none, 1 or 2 blocks. One-block
 * steps were once left to the engine's auto step, which a controlling rider
 * turns off (ADR 0035).
 */
export function stepHeight(solid: SolidAt, speed: number): 0 | 1 | 2 {
  if (solid(0, 0, OVERHEAD_PROBE)) return 0; // Blocked overhead
  const lookahead = speed * SPEC.stepLookaheadTicks + SPEC.stepLookaheadMargin;
  const from = SPEC.hitboxFront + 0.1;
  // The epsilon keeps the last scan point despite floating-point accumulation in `d`.
  const to = SPEC.hitboxFront + lookahead + 1e-9;
  for (let d = from; d <= to; d += SPEC.stepScanStep) {
    let height: 0 | 1 | 2 = 0;
    for (const side of STEP_LANES) {
      if (!solid(d, side, 0.5)) continue; // No obstacle on this ray yet
      const h = solid(d, side, 1.5) ? 2 : 1;
      // A step of height 3 or more, or one without room above it for the
      // vehicle, is a wall: stop scanning.
      if (clearanceProbes(h).some((dy) => solid(d, side, dy))) return 0;
      if (h > height) height = h;
    }
    if (height > 0) return height;
  }
  return 0;
}
