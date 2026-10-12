// The SUV's transforming drivetrain: forms, landing gear, bank, and vertical motion (ADR 0050).
import { clamp, rightOf, type Vec2 } from "../shared/vec";
import { bankSink, stepBank } from "./bank";
import type { Drive, DriveStep, TickContext } from "./drive";
import {
  type DriveInput,
  NEUTRAL_INPUT,
  type RawInput,
  toDriveInput,
} from "./driveInput";
import {
  climbInput,
  type Form,
  type FormState,
  initialForm,
  stepForm,
  verticalImpulse,
  verticalSpeed,
} from "./form";
import { nextGearDown } from "./landingGear";
import {
  AIR,
  alignOnMount,
  initialMotion,
  type MotionResult,
  type MotionState,
  type StepProbe,
  stepFlightMotion,
  stepMotion,
  WATER,
} from "./motion";
import type { MotionLimits } from "./profile";
import { SPEC } from "./spec";
import { stepHeight } from "./stepUp";
import { submarineVerticalSpeed } from "./submarine";
import { waterDepthAt } from "./water";

// Frozen because every SUV drive shares this one object.
export const SUV_MOTION: MotionLimits = Object.freeze({
  maxSpeed: SPEC.maxSpeed,
  maxReverse: SPEC.maxReverse,
  accel: SPEC.accel,
  reverseAccel: SPEC.reverseAccel,
  brake: SPEC.brake,
  drag: SPEC.drag,
  turnRate: SPEC.turnRate,
  steerFullSpeed: SPEC.steerFullSpeed,
  grip: SPEC.grip,
  handbrakeGrip: SPEC.handbrakeGrip,
  creepSpeed: SPEC.creepSpeed,
});

function stepProbe(ctx: TickContext, drop = 0): StepProbe {
  return (f, speed) => {
    const r = rightOf(f);
    return stepHeight(
      (ahead, side, dy) =>
        ctx.solidAt({
          x: f.x * ahead + r.x * side,
          y: dy - drop,
          z: f.z * ahead + r.z * side,
        }),
      speed,
    );
  };
}

/** Whether there is a solid block within gearDownHeight below the center or a corner of the vehicle. */
function groundNear(ctx: TickContext, f: Vec2): boolean {
  const r = rightOf(f);
  const d = SPEC.gearProbeOffset;
  const spots = [
    [0, 0],
    [d, d],
    [d, -d],
    [-d, d],
    [-d, -d],
  ] as const;
  for (let dy = 1; dy <= SPEC.gearDownHeight; dy++)
    for (const [ahead, side] of spots)
      if (
        ctx.solidAt({
          x: f.x * ahead + r.x * side,
          y: -dy,
          z: f.z * ahead + r.z * side,
        })
      )
        return true;
  return false;
}

/**
 * Takeoff ignores the controls, and there is no handbrake in the air or as a
 * submarine (ADR 0021). Out of car form the stick pulled back sinks instead of
 * reversing, in the air (ADR 0032) and under water (ADR 0040).
 */
function driveInputFor(raw: RawInput | undefined, form: Form): DriveInput {
  if (!raw || form === "takeoff") return NEUTRAL_INPUT;
  const input = toDriveInput(raw);
  if (form === "car") return input;
  return { ...input, throttle: Math.max(0, input.throttle), handbrake: false };
}

export class SuvDrive implements Drive {
  private motion: MotionState;
  private formState: FormState;
  private bank = 0;
  // Undefined until the first tick, so a rebuilt vehicle clears a bank the
  // entity kept from before /reload.
  private sentBank: number | undefined;
  private gearDown: boolean;
  // Undefined until the first tick, like sentBank.
  private sentGearDown: boolean | undefined;

  constructor(yaw: number, form: Form) {
    this.motion = initialMotion(yaw);
    this.formState = initialForm(form);
    this.gearDown = form === "car";
  }

  get speed(): number {
    return this.motion.speed;
  }

  get yaw(): number {
    return this.motion.yaw;
  }

  get form(): Form {
    return this.formState.form;
  }

  get wheelsDown(): boolean {
    return this.gearDown;
  }

  get bankAngle(): number {
    return this.bank;
  }

  onDriverMounted(driverYaw: number): void {
    this.motion = alignOnMount(this.motion, driverYaw);
  }

  step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    const motion = this.motion;
    const waterDepth = waterDepthAt(ctx.location, ctx.waterAt, SPEC.carHeight);
    const velocity = { x: ctx.velocity.x, z: ctx.velocity.z };
    const before = this.formState.form;
    this.formState = stepForm(this.formState, {
      tick: ctx.tick,
      jump: raw?.jump ?? false,
      controlled: raw !== undefined,
      onGround: ctx.onGround,
      waterDepth,
    });
    const form = this.formState.form;
    const input = driveInputFor(raw, form);
    const yawBefore = motion.yaw;
    const step: MotionResult =
      form === "car"
        ? stepMotion(
            motion,
            input,
            { velocity, onGround: ctx.onGround },
            stepProbe(ctx),
            SUV_MOTION,
          )
        : stepFlightMotion(
            motion,
            input,
            velocity,
            form === "submarine" ? WATER : AIR,
            SUV_MOTION,
          );
    this.bank = stepBank(this.bank, form, yawBefore, step.state.yaw);
    let impulseY: number;
    if (form === "car") {
      impulseY = step.jumpVelocity;
    } else if (form === "submarine") {
      // Gated like a step jump in stepMotion (speed >= 0). The stepMinSpeed
      // floor only sets how far ahead the probe looks, not whether it rises:
      // pressed against a shore step the wall check drops speed to about 0,
      // and the bare look-ahead margin would miss a step face just beyond it
      // (ADR 0035).
      const rising =
        input.throttle > 0 &&
        step.state.speed >= 0 &&
        stepProbe(ctx, SPEC.submarineStepProbeDrop)(
          step.forward,
          Math.max(step.state.speed, SPEC.stepMinSpeed),
        ) > 0;
      const targetVy = submarineVerticalSpeed({
        climb: climbInput(raw),
        controlled: raw !== undefined,
        rising,
        waterDepth,
      });
      impulseY = verticalImpulse(
        targetVy,
        ctx.velocity.y,
        SPEC.waterVerticalDrag,
      );
    } else {
      const targetVy = clamp(
        verticalSpeed(form, climbInput(raw)) - bankSink(form, this.bank),
        -SPEC.maxClimb,
        SPEC.maxClimb,
      );
      impulseY = verticalImpulse(targetVy, ctx.velocity.y);
    }
    const bank = this.bank === this.sentBank ? undefined : this.bank;
    this.sentBank = this.bank;
    this.gearDown = nextGearDown(this.gearDown, form, () =>
      groundNear(ctx, step.forward),
    );
    const gearDown =
      this.gearDown === this.sentGearDown ? undefined : this.gearDown;
    this.sentGearDown = this.gearDown;

    this.motion = step.state;
    return {
      impulse: { x: step.impulse.x, y: impulseY, z: step.impulse.z },
      forward: step.forward,
      form: form === before ? undefined : form,
      bank,
      gearDown,
    };
  }
}
