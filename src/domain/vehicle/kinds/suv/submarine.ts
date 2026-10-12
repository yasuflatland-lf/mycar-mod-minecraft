import { clamp } from "../../../shared/vec";
import { SUV_SPEC } from "./spec";

export interface DiveInput {
  /** Climb command from climbInput(raw), from -1 to 1. */
  climb: number;
  /** Whether a driver or test input controls the vehicle. */
  controlled: boolean;
  /** Whether a step lies ahead. */
  rising: boolean;
  waterDepth: number;
}

/**
 * Target vertical velocity in blocks/tick, with controlled climb taking
 * priority over step rise and buoyancy. With a driver, buoyancy only pulls
 * down to the float line so a dive holds its depth; without one, the vehicle
 * floats up to the float line.
 */
export function submarineVerticalSpeed(input: DiveInput): number {
  if (input.controlled && Number.isFinite(input.climb) && input.climb !== 0)
    return clamp(input.climb, -1, 1) * SUV_SPEC.maxClimb;
  if (input.rising) return SUV_SPEC.maxClimb;
  const depth = Number.isFinite(input.waterDepth) ? input.waterDepth : 0;
  const buoyancy = clamp(
    (depth - SUV_SPEC.floatDraft) * SUV_SPEC.floatGain,
    -SUV_SPEC.surfaceRise,
    SUV_SPEC.surfaceRise,
  );
  return input.controlled ? Math.min(0, buoyancy) : buoyancy;
}
