// The sports boat's drive: the engine floats the hull and the script drives only x and z (ADR 0051).
import type { Drive, DriveResult } from "./drive";
import {
  type DriveInput,
  NEUTRAL_INPUT,
  type RawInput,
  toDriveInput,
} from "./driveInput";
import type { Form } from "./form";
import {
  type Medium,
  type MotionState,
  stepFlightMotion,
  stepMotion,
} from "./motion";
import type { VehicleProfile } from "./profile";
import type { TickContext } from "./vehicle";

/** Engine drag per tick on a buoyant hull in water; provisional until 8/8 measures it. */
export const SPORTSBOAT_WATER: Medium = { drag: 0.83, maxSpeed: 1.12 };

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
    // There is no handbrake: neither path below reads it, so jump does nothing.
    const input: DriveInput = raw ? toDriveInput(raw) : NEUTRAL_INPUT;
    // Beached, it coasts to a stop and never steps up a block.
    const step = isAfloat(ctx.waterDepth, ctx.waterBelow)
      ? stepFlightMotion(
          motion,
          input,
          ctx.velocity,
          SPORTSBOAT_WATER,
          profile.motion,
        )
      : stepMotion(
          motion,
          NEUTRAL_INPUT,
          { velocity: ctx.velocity, onGround: ctx.onGround },
          () => 0,
          profile.motion,
        );
    // Buoyancy and gravity belong to the engine, so the script never pushes vertically.
    return {
      motion: step.state,
      impulse: { x: step.impulse.x, y: 0, z: step.impulse.z },
      forward: step.forward,
    };
  }
}
