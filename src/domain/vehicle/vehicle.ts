// Aggregate for one vehicle: motion, driver, seats, ram cooldowns, and the hit count.
import { clamp, forward, rightOf, type Vec2, type Vec3 } from "../shared/vec";
import { bankSink, stepBank } from "./bank";
import {
  type DriveInput,
  NEUTRAL_INPUT,
  type RawInput,
  toDriveInput,
} from "./driveInput";
import type { VehicleEvent } from "./events";
import {
  climbInput,
  type Form,
  type FormState,
  initialForm,
  stepForm,
  verticalImpulse,
  verticalSpeed,
} from "./form";
import { EMPTY_COUNTER, type HitCounter, registerHit } from "./hitCounter";
import { nextGearDown } from "./landingGear";
import {
  AIR,
  initialMotion,
  type MotionResult,
  type MotionState,
  type StepProbe,
  stepFlightMotion,
  stepMotion,
  WATER,
} from "./motion";
import { type RamHit, type RamTarget, selectHits } from "./ram";
import { doorOf, occupiedSeats, vacatedSeats } from "./seats";
import { SPEC } from "./spec";
import { stepHeight } from "./stepUp";
import { submarineVerticalSpeed } from "./submarine";

export interface RiderView {
  id: string;
  offset: Vec2;
  yaw: number;
  raw: RawInput;
}

export interface TickContext {
  tick: number;
  riders: readonly RiderView[];
  /** Input used only when there is no driver (for in-game tests). */
  testInput?: RawInput;
  velocity: Vec2;
  onGround: boolean;
  /** Blocks of water above the feet; absent or 0 out of water. */
  waterDepth?: number;
  /** Vertical velocity from the engine (blocks/tick). Read whenever the form is not car, including the tick takeoff starts. */
  velocityY?: number;
  /** Whether the block at entity location + offset (world axes, y from the feet) is solid; air, liquids and blocks without a collision box (flowers, grass, carpets) are not (ADR 0035). */
  solidAt(offset: Vec3): boolean;
  /** Nearby targets. Called only when the speed exceeds the ram threshold. */
  targets(): readonly RamTarget[];
}

export interface TickOutcome {
  impulse: Vec3;
  yaw: number;
  hits: RamHit[];
  driverId?: string;
  events: VehicleEvent[];
  /** The new vehicle form, only on the tick it changes (ADR 0021). */
  form?: Form;
  /** The new bank angle in degrees, only on the tick it changes and on the first tick (ADR 0026). */
  bank?: number;
  /** Whether the wheels are in the driving pose, only on the tick it changes and on the first tick (ADR 0033). */
  gearDown?: boolean;
}

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
 * Takeoff ignores the controls, and there is no handbrake in the air (ADR
 * 0021). In the air the stick pulled back sinks instead of reversing (ADR 0032).
 */
function driveInputFor(raw: RawInput | undefined, form: Form): DriveInput {
  if (!raw || form === "takeoff") return NEUTRAL_INPUT;
  const input = toDriveInput(raw);
  if (form === "car") return input;
  return { ...input, throttle: Math.max(0, input.throttle), handbrake: false };
}

export class Vehicle {
  private motion: MotionState;
  private formState: FormState;
  private bank = 0;
  // Undefined until the first tick, so a rebuilt vehicle clears a bank the
  // entity kept from before /reload.
  private sentBank: number | undefined;
  private gearDown: boolean;
  // Undefined until the first tick, like sentBank.
  private sentGearDown: boolean | undefined;
  private driverId: string | undefined;
  private seats = new Map<string, number>();
  private readonly lastHit = new Map<string, number>();
  private hitCounter: HitCounter = EMPTY_COUNTER;
  private lastSwitchUseTick = Number.NEGATIVE_INFINITY;

  private constructor(
    readonly id: string,
    yaw: number,
    form: Form = "car",
  ) {
    this.motion = initialMotion(yaw);
    this.formState = initialForm(form);
    this.gearDown = form === "car";
  }

  static create(id: string, yaw: number): Vehicle {
    return new Vehicle(id, yaw);
  }

  /**
   * Rebuilds a vehicle whose aggregate was lost (e.g. after `/reload`) while
   * riders may already be seated. Seeding the seats and the driver keeps the
   * first tick from treating the current driver as newly mounted, which would
   * snap the heading to the driver's view. The vehicle form comes from the
   * entity, so a vehicle in the air keeps flying (ADR 0021).
   */
  static rebuild(
    id: string,
    yaw: number,
    riders: readonly RiderView[],
    form: Form = "car",
  ): Vehicle {
    const v = new Vehicle(id, yaw, form);
    v.seats = occupiedSeats(riders, forward(yaw));
    v.driverId = riders.find((r) => v.seats.get(r.id) === 0)?.id;
    return v;
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

  /** Whether the wheels are in the driving pose (ADR 0033). */
  get wheelsDown(): boolean {
    return this.gearDown;
  }

  /** Bank angle in degrees; positive lowers the right side (ADR 0026). */
  get bankAngle(): number {
    return this.bank;
  }

  tick(ctx: TickContext): TickOutcome {
    const events = this.updateSeats(ctx.riders);
    const driver = this.updateDriver(ctx.riders);

    const raw = driver ? driver.raw : ctx.testInput;
    const before = this.formState.form;
    this.formState = stepForm(this.formState, {
      tick: ctx.tick,
      jump: raw?.jump ?? false,
      controlled: raw !== undefined,
      onGround: ctx.onGround,
      waterDepth: ctx.waterDepth ?? 0,
    });
    const form = this.formState.form;
    const input = driveInputFor(raw, form);
    const yawBefore = this.motion.yaw;
    const step: MotionResult =
      form === "car"
        ? stepMotion(
            this.motion,
            input,
            { velocity: ctx.velocity, onGround: ctx.onGround },
            stepProbe(ctx),
          )
        : stepFlightMotion(
            this.motion,
            input,
            ctx.velocity,
            form === "submarine" ? WATER : AIR,
          );
    this.motion = step.state;
    this.bank = stepBank(this.bank, form, yawBefore, this.motion.yaw);
    let impulseY: number;
    if (form === "car") {
      impulseY = step.jumpVelocity;
    } else if (form === "submarine") {
      // Gated like a step jump in stepMotion (speed >= 0), which only raises
      // speed to stepMinSpeed after deciding to jump. Pressed against a shore
      // step the wall check drops speed to about 0, so gating on stepMinSpeed
      // would leave the vehicle stuck under the step.
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
        waterDepth: ctx.waterDepth ?? 0,
      });
      impulseY = verticalImpulse(
        targetVy,
        ctx.velocityY ?? 0,
        SPEC.waterVerticalDrag,
      );
    } else {
      const targetVy = clamp(
        verticalSpeed(form, climbInput(raw)) - bankSink(form, this.bank),
        -SPEC.maxClimb,
        SPEC.maxClimb,
      );
      impulseY = verticalImpulse(targetVy, ctx.velocityY ?? 0);
    }
    const bank = this.bank === this.sentBank ? undefined : this.bank;
    this.sentBank = this.bank;
    this.gearDown = nextGearDown(this.gearDown, form, () =>
      groundNear(ctx, step.forward),
    );
    const gearDown =
      this.gearDown === this.sentGearDown ? undefined : this.gearDown;
    this.sentGearDown = this.gearDown;

    return {
      impulse: { x: step.impulse.x, y: impulseY, z: step.impulse.z },
      yaw: step.state.yaw,
      hits: this.ram(ctx, step.forward),
      driverId: driver?.id,
      events,
      form: form === before ? undefined : form,
      bank,
      gearDown,
    };
  }

  private updateSeats(riders: readonly RiderView[]): VehicleEvent[] {
    const seats = occupiedSeats(riders, forward(this.motion.yaw));
    const events: VehicleEvent[] = vacatedSeats(this.seats, seats).map(
      (seat) => ({
        type: "SeatVacated",
        vehicleId: this.id,
        seat,
        door: doorOf(seat),
      }),
    );
    this.seats = seats;
    return events;
  }

  private updateDriver(riders: readonly RiderView[]): RiderView | undefined {
    // Driver = the rider in the driver's seat (seat 0) (ADR 0019). A driver
    // stays the driver while they ride: a rider's position can lag the moving
    // vehicle by a tick and read as another seat, which in flight would land
    // the vehicle (ADR 0025).
    const driver =
      riders.find((r) => r.id === this.driverId) ??
      riders.find((r) => this.seats.get(r.id) === 0);
    if (
      driver &&
      this.driverId !== driver.id &&
      Math.abs(this.motion.speed) < SPEC.mountAlignSpeed
    ) {
      this.motion = { ...this.motion, yaw: driver.yaw };
    }
    this.driverId = driver?.id;
    return driver;
  }

  private ram(ctx: TickContext, f: Vec2): RamHit[] {
    for (const [id, t] of this.lastHit)
      if (ctx.tick - t >= SPEC.ramCooldown) this.lastHit.delete(id);
    // selectHits checks the speed too; checking here skips the targets() query.
    if (Math.abs(this.motion.speed) <= SPEC.ramMinSpeed) return [];
    const hits = selectHits(
      f,
      this.motion.speed,
      ctx.targets(),
      this.lastHit,
      ctx.tick,
    );
    for (const h of hits) this.lastHit.set(h.id, ctx.tick);
    return hits;
  }

  /**
   * A player uses the headlight switch. Only the driver may flip it, and only
   * after the switch has been idle for the cooldown, so a burst of uses from
   * one touch flips it once (ADR 0024). Returns whether it flipped.
   */
  flipHeadlightSwitch(playerId: string, tick: number): boolean {
    if (playerId !== this.driverId) return false;
    const idle = tick - this.lastSwitchUseTick;
    this.lastSwitchUseTick = tick;
    return idle >= SPEC.headlightSwitchCooldown;
  }

  /** Hit by a player. Returns VehicleBroken when the vehicle breaks (ADR 0008). */
  receiveHit(tick: number): VehicleEvent[] {
    const r = registerHit(this.hitCounter, tick, this.seats.size > 0);
    this.hitCounter = r.counter;
    return r.broken ? [{ type: "VehicleBroken", vehicleId: this.id }] : [];
  }
}
