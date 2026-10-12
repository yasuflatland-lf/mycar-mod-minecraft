// The sports boat's drive: the engine floats the hull and the script drives only x and z (ADR 0051).
import { clamp, dot, type Vec2 } from "../shared/vec";
import type { Drive, DriveStep, TickContext } from "./drive";
import {
  type DriveInput,
  NEUTRAL_INPUT,
  type RawInput,
  toDriveInput,
} from "./driveInput";
import type { Form } from "./form";
import {
  alignOnMount,
  hitWall,
  initialMotion,
  type Medium,
  type MotionResult,
  type MotionState,
  stepFlightMotion,
  stepMotion,
} from "./motion";
import type { MotionLimits } from "./profile";
import { SPEC } from "./spec";
import { waterBelowAt, waterDepthAt } from "./water";

// The height of the sportsboat collision box, which bounds the water depth
// query; the boat only tests whether the depth is above zero.
const SPORTSBOAT_HEIGHT = 1.2;

/** The sports boat's own limits (ADR 0051), written out even where they equal the SUV's today. */
export const SPORTSBOAT_MOTION: MotionLimits = Object.freeze({
  maxSpeed: 1.12, // ADR 0051
  maxReverse: 0.2, // ADR 0051
  accel: 0.0225, // ADR 0051
  reverseAccel: 0.01125, // Half of accel, as on land
  brake: 0.04,
  drag: 0.02,
  turnRate: 6, // degrees/tick at full steering input (ADR 0051)
  steerFullSpeed: 0.08,
  grip: 0.6,
  handbrakeGrip: 0.6, // Equal to grip: the boat has no handbrake
  creepSpeed: 0.12, // Below SPEC.ramMinSpeed, so creeping never rams (ADR 0006)
});

// boat_drag measured 0.833 at full speed, 0.916-0.927 on the 3 ticks of every
// 14 at the top of the bob, and 0.815 the tick after; weight 0.1 keeps one bump
// to about +0.02 on the estimate (ADR 0053).
export const SPORTSBOAT_DRAG = {
  initial: 0.83,
  min: 0.7,
  max: 0.95,
  smoothing: 0.1,
  minGiven: 0.05,
} as const;

export const SPORTSBOAT_WATER: Medium = {
  drag: SPORTSBOAT_DRAG.initial,
  maxSpeed: SPORTSBOAT_MOTION.maxSpeed,
};

function boundDrag(drag: number): number {
  return clamp(drag, SPORTSBOAT_DRAG.min, SPORTSBOAT_DRAG.max);
}

/** The estimate a tick starts from: the stored one, bounded, or the initial value. */
function currentWaterDrag(prev: number | undefined): number {
  return boundDrag(prev ?? SPORTSBOAT_DRAG.initial);
}

export function estimateWaterDrag(
  prev: number | undefined,
  given: Vec2 | undefined,
  observed: Vec2,
): number {
  const estimate = currentWaterDrag(prev);
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

/** What a boat drive carries from one tick to the next. */
export interface BoatDriveState {
  readonly motion: MotionState;
  /** The water drag estimate (ADR 0053): undefined until the boat first floats, kept while beached. */
  readonly waterDrag?: number;
}

export class BoatDrive implements Drive {
  readonly form: Form = "car";
  readonly wheelsDown = true;
  readonly bankAngle = 0;
  private motion: MotionState;
  private dragEstimate: number | undefined;

  /** `limits` other than the boat's own are for tests that vary one value. */
  constructor(
    yaw: number,
    private readonly limits: MotionLimits = SPORTSBOAT_MOTION,
  ) {
    this.motion = initialMotion(yaw);
  }

  get speed(): number {
    return this.motion.speed;
  }

  get yaw(): number {
    return this.motion.yaw;
  }

  get waterDrag(): number | undefined {
    return this.dragEstimate;
  }

  get state(): BoatDriveState {
    return { motion: this.motion, waterDrag: this.dragEstimate };
  }

  /** Starts the drive from a given state, for tests that begin mid-run. */
  restore(state: BoatDriveState): this {
    this.motion = state.motion;
    this.dragEstimate = state.waterDrag;
    return this;
  }

  onDriverMounted(driverYaw: number): void {
    this.motion = alignOnMount(this.motion, driverYaw);
  }

  step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    // There is no handbrake: neither path below reads it, so jump does nothing.
    const input: DriveInput = raw ? toDriveInput(raw) : NEUTRAL_INPUT;
    const motion = this.motion;
    let step: MotionResult;
    const depth = waterDepthAt(ctx.location, ctx.waterAt, SPORTSBOAT_HEIGHT);
    if (isAfloat(depth, depth > 0 ? undefined : waterBelowAt(ctx.waterAt))) {
      const waterDrag = estimateWaterDrag(
        this.dragEstimate,
        motion.airExpected,
        ctx.velocity,
      );
      // Divide by the updated estimate, but check walls against the one the
      // estimator checked, so a tick taken as a drag sample is never also a wall hit.
      step = stepFlightMotion(
        motion,
        input,
        ctx.velocity,
        {
          ...SPORTSBOAT_WATER,
          drag: waterDrag,
          wallDrag: currentWaterDrag(this.dragEstimate),
        },
        this.limits,
      );
      this.dragEstimate = waterDrag;
    } else {
      // Beached, it coasts to a stop and never steps up a block.
      step = stepMotion(
        motion,
        NEUTRAL_INPUT,
        { velocity: ctx.velocity, onGround: ctx.onGround },
        () => 0,
        this.limits,
      );
    }
    this.motion = step.state;
    // Buoyancy and gravity belong to the engine, so the script never pushes vertically.
    return {
      impulse: { x: step.impulse.x, y: 0, z: step.impulse.z },
      forward: step.forward,
    };
  }
}
