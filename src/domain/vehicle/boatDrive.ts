// The sports boat's drive: the engine floats the hull and the script drives only x and z (ADR 0051).
import { clamp, dot, type Vec2 } from "../shared/vec";
import type { Drive, DriveResult } from "./drive";
import {
  type DriveInput,
  NEUTRAL_INPUT,
  type RawInput,
  toDriveInput,
} from "./driveInput";
import type { Form } from "./form";
import {
  hitWall,
  type Medium,
  type MotionResult,
  type MotionState,
  stepFlightMotion,
  stepMotion,
} from "./motion";
import { SPORTSBOAT_PROFILE, type VehicleProfile } from "./profile";
import { SPEC } from "./spec";
import type { TickContext } from "./vehicle";

// boat_drag measured 0.833 at full speed, 0.916-0.927 on the 3 ticks of every
// 14 at the top of the bob, and 0.815 the tick after; weight 0.1 keeps one bump
// to about +0.02 on the estimate (ADR 0052).
export const SPORTSBOAT_DRAG = {
  initial: 0.83,
  min: 0.7,
  max: 0.95,
  smoothing: 0.1,
  minGiven: 0.05,
} as const;

export const SPORTSBOAT_WATER: Medium = {
  drag: SPORTSBOAT_DRAG.initial,
  maxSpeed: SPORTSBOAT_PROFILE.motion.maxSpeed,
};

function boundDrag(drag: number): number {
  return clamp(drag, SPORTSBOAT_DRAG.min, SPORTSBOAT_DRAG.max);
}

export function estimateWaterDrag(
  prev: number | undefined,
  given: Vec2 | undefined,
  observed: Vec2,
): number {
  const estimate = boundDrag(prev ?? SPORTSBOAT_DRAG.initial);
  if (!given) return estimate;
  const givenSq = dot(given, given);
  if (
    givenSq <= SPORTSBOAT_DRAG.minGiven ** 2 ||
    hitWall(observed, given, estimate * SPEC.blockedRatio)
  )
    return estimate;
  const sample = boundDrag(dot(observed, given) / givenSq);
  return boundDrag(
    estimate * (1 - SPORTSBOAT_DRAG.smoothing) +
      sample * SPORTSBOAT_DRAG.smoothing,
  );
}

export function isAfloat(
  waterDepth: number | undefined,
  waterBelow: boolean | undefined,
): boolean {
  return (waterDepth ?? 0) > 0 || waterBelow === true;
}

export class BoatDrive implements Drive {
  readonly form: Form = "car";
  readonly wheelsDown = true;
  readonly bankAngle = 0;

  step(
    motion: MotionState,
    raw: RawInput | undefined,
    ctx: TickContext,
    profile: VehicleProfile,
  ): DriveResult {
    // There is no handbrake, so jump does nothing.
    const input: DriveInput = raw
      ? { ...toDriveInput(raw), handbrake: false }
      : NEUTRAL_INPUT;
    let step: MotionResult;
    if (isAfloat(ctx.waterDepth, ctx.waterBelow)) {
      const waterDrag = estimateWaterDrag(
        motion.waterDrag,
        motion.airExpected,
        ctx.velocity,
      );
      step = stepFlightMotion(
        { ...motion, waterDrag },
        input,
        ctx.velocity,
        { ...SPORTSBOAT_WATER, drag: waterDrag },
        profile.motion,
      );
    } else {
      // Beached, it coasts to a stop and never steps up a block.
      step = stepMotion(
        motion,
        NEUTRAL_INPUT,
        { velocity: ctx.velocity, onGround: ctx.onGround },
        () => 0,
        profile.motion,
      );
    }
    // Buoyancy and gravity belong to the engine, so the script never pushes vertically.
    return {
      motion: step.state,
      impulse: { x: step.impulse.x, y: 0, z: step.impulse.z },
      forward: step.forward,
    };
  }
}
