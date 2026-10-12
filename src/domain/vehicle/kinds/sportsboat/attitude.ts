// How the hull sits on the water as it drives: the bow rises while the boat
// gains speed, and the hull rolls into a turn (ADR 0059, ADR 0061).
import { clamp, normalizeYaw } from "../../../shared/vec";
import { SPORTSBOAT_MOTION } from "./profile";

export const SPORTSBOAT_ATTITUDE = {
  /** Degrees of bow rise while the forward speed grows by a full `accel` per tick. */
  maxTrim: 7,
  /** Speed gained per tick that gives `maxTrim`: full throttle from rest. */
  fullGain: SPORTSBOAT_MOTION.accel,
  /** Degrees per tick toward a higher trim, so the bow lifts in about 0.7 s. */
  trimRiseRate: 0.5,
  /** Degrees per tick toward a lower trim, so the bow settles in about 1.4 s. */
  trimSettleRate: 0.25,
  /** Degrees of roll in a turn at the full turn rate and top speed (ADR 0061). */
  maxRoll: 20,
  /** Degrees per tick, so a full roll builds up in half a second (ADR 0061). */
  rollRate: 2,
} as const;

/**
 * Next bow rise in degrees, 0 to `maxTrim`. Afloat, the target follows how
 * much forward speed the tick gained; reversing, slowing, or holding speed
 * gives a level target, as does running aground.
 */
export function stepTrim(
  prev: number,
  speedBefore: number,
  speedAfter: number,
  afloat: boolean,
): number {
  const gain = Math.max(speedAfter, 0) - Math.max(speedBefore, 0);
  const target = afloat
    ? clamp(gain / SPORTSBOAT_ATTITUDE.fullGain, 0, 1) *
      SPORTSBOAT_ATTITUDE.maxTrim
    : 0;
  const rate =
    target > prev
      ? SPORTSBOAT_ATTITUDE.trimRiseRate
      : SPORTSBOAT_ATTITUDE.trimSettleRate;
  return prev + clamp(target - prev, -rate, rate);
}

/**
 * Next roll in degrees; positive lowers the right side, as the SUV's bank
 * does (ADR 0026). Afloat, the target leans into the turn in proportion to how
 * fast the heading turns and to the speed, so the hull stays level when it
 * turns slowly or at rest. Aground, the target is level.
 */
export function stepRoll(
  prev: number,
  yawBefore: number,
  yawAfter: number,
  speed: number,
  afloat: boolean,
): number {
  const turn = normalizeYaw(yawAfter - yawBefore) / SPORTSBOAT_MOTION.turnRate;
  const pace = Math.abs(speed) / SPORTSBOAT_MOTION.maxSpeed;
  const target =
    afloat && Number.isFinite(turn)
      ? clamp(turn, -1, 1) * clamp(pace, 0, 1) * SPORTSBOAT_ATTITUDE.maxRoll
      : 0;
  const rate = SPORTSBOAT_ATTITUDE.rollRate;
  return prev + clamp(target - prev, -rate, rate);
}
