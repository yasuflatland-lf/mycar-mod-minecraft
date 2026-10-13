// The sports boat's drive: the engine floats the hull and the script drives only x and z (ADR 0051).
import { clamp, dot, forward, type Vec2 } from "../../../shared/vec";
import type { Dock } from "../../dock";
import type {
  Drive,
  DriveStep,
  EngineCommand,
  RestoredValues,
  TickContext,
} from "../../drive";
import {
  type DriveInput,
  NEUTRAL_INPUT,
  type RawInput,
  toDriveInput,
} from "../../driveInput";
import type { HoldPose } from "../../floor";
import { MOTION } from "../../motion/constants";
import {
  alignOnMount,
  hitWall,
  initialMotion,
  type Medium,
  type MotionResult,
  type MotionState,
  stepFlightMotion,
  stepMotion,
} from "../../motion/motion";
import { waterBelowAt, waterDepthAt } from "../../motion/water";
import type { MotionLimits } from "../../profile";
import { seatWorldPositions } from "../../seats";
import { stepRoll, stepTrim } from "./attitude";
import { DOCK, floorCells, holdHeight } from "./deck";
import {
  dockCommands,
  rollCommand,
  trimCommand,
  undockCommands,
} from "./entity";
import { SPORTSBOAT_MOTION, SPORTSBOAT_PROFILE } from "./profile";

// The height of the sportsboat collision box, which bounds the water depth
// query; the boat only tests whether the depth is above zero.
const SPORTSBOAT_HEIGHT = 1.2;

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
    hitWall(observed, given, estimate * MOTION.blockedRatio)
  )
    return estimate;
  const sample = boundDrag(dot(observed, given) / givenSq);
  return boundDrag(
    estimate * (1 - SPORTSBOAT_DRAG.smoothing) +
      sample * SPORTSBOAT_DRAG.smoothing,
  );
}

function pushesStick(input: RawInput | undefined): boolean {
  return (
    input !== undefined &&
    Math.max(Math.abs(input.moveX), Math.abs(input.moveY)) > DOCK.stick
  );
}

function dockAt(pose: HoldPose): Dock {
  return {
    hold: pose,
    floor: floorCells(pose),
    seats: seatWorldPositions(pose, SPORTSBOAT_PROFILE.seats.positions),
  };
}

export function isAfloat(depth: number, below: () => boolean): boolean {
  return depth > 0 || below();
}

/** What a boat drive carries from one tick to the next. */
export interface BoatDriveState {
  readonly motion: MotionState;
  /** The water drag estimate (ADR 0053): undefined until the boat first floats, kept while beached. */
  readonly waterDrag?: number;
}

export class BoatDrive implements Drive {
  private motion: MotionState;
  private dragEstimate: number | undefined;
  private trim = 0;
  private roll = 0;
  private docked: HoldPose | undefined;
  private stillTicks = 0;
  private restoredDocked: boolean;
  // Undefined until the first tick, so a rebuilt vehicle clears a trim or roll
  // the entity kept from before /reload, as the SUV does with its bank.
  private sentTrim: number | undefined;
  private sentRoll: number | undefined;

  /** `limits` other than the boat's own are for tests that vary one value. */
  constructor(
    yaw: number,
    restored: RestoredValues,
    private readonly limits: MotionLimits = SPORTSBOAT_MOTION,
  ) {
    this.motion = initialMotion(yaw);
    this.restoredDocked = restored.docked === true;
  }

  get isDocked(): boolean {
    return this.docked !== undefined;
  }

  get speed(): number {
    return this.motion.speed;
  }

  get yaw(): number {
    return this.motion.yaw;
  }

  get trimAngle(): number {
    return this.trim;
  }

  get rollAngle(): number {
    return this.roll;
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
    // A held hull keeps its hold yaw, so turning the drive to the driver here
    // would point the seats and headlights away from the bow until undocking.
    if (this.docked || this.restoredDocked) return;
    this.motion = alignOnMount(this.motion, driverYaw);
  }

  onSeatVacated(_seat: number): readonly EngineCommand[] {
    return [];
  }

  step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    if (this.restoredDocked && !this.docked) {
      this.docked = { ...ctx.location, yaw: this.motion.yaw };
      this.restoredDocked = false;
    }
    const commands: EngineCommand[] = [];
    let boardDeckRiders = false;
    if (this.docked) {
      if (!pushesStick(raw)) {
        return {
          dock: dockAt(this.docked),
          boardDeckRiders: pushesStick(ctx.deckSeatInputs[0]),
          impulse: { x: 0, y: 0, z: 0 },
          forward: forward(this.docked.yaw),
          commands: [],
          riders: { thirdPerson: false, underwater: false },
        };
      }
      boardDeckRiders = true;
      commands.push(...undockCommands());
      this.docked = undefined;
      this.stillTicks = 0;
    }
    // There is no handbrake: neither path below reads it, so jump does nothing.
    const input: DriveInput = raw ? toDriveInput(raw) : NEUTRAL_INPUT;
    const motion = this.motion;
    let step: MotionResult;
    const depth = waterDepthAt(ctx.location, ctx.waterAt, SPORTSBOAT_HEIGHT);
    const afloat = isAfloat(depth, () => waterBelowAt(ctx.waterAt));
    if (afloat) {
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
    this.stillTicks =
      afloat && raw === undefined && Math.abs(step.state.speed) < DOCK.maxSpeed
        ? this.stillTicks + 1
        : 0;
    if (this.stillTicks >= DOCK.ticks) {
      const holdY = holdHeight(ctx.location.y, (dy) =>
        ctx.waterAt({ x: 0, y: dy, z: 0 }),
      );
      if (holdY !== undefined) {
        this.docked = { ...ctx.location, y: holdY, yaw: step.state.yaw };
        this.motion = { ...step.state, speed: 0 };
        commands.push(...dockCommands());
      }
    }
    if (this.docked) {
      // A docked boat sits level, so docking clears any residual trim or roll.
      this.trim = 0;
      this.roll = 0;
    } else {
      this.trim = stepTrim(this.trim, motion.speed, step.state.speed, afloat);
      this.roll = stepRoll(
        this.roll,
        motion.yaw,
        step.state.yaw,
        step.state.speed,
        afloat,
      );
    }
    if (this.trim !== this.sentTrim) commands.push(trimCommand(this.trim));
    if (this.roll !== this.sentRoll) commands.push(rollCommand(this.roll));
    this.sentTrim = this.trim;
    this.sentRoll = this.roll;
    // Buoyancy and gravity belong to the engine, so the script never pushes vertically.
    return {
      impulse: { x: step.impulse.x, y: 0, z: step.impulse.z },
      forward: step.forward,
      commands,
      riders: { thirdPerson: false, underwater: false },
      boardDeckRiders,
      ...(this.docked && { dock: dockAt(this.docked) }),
    };
  }
}
