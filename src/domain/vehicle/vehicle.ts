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
  type FlightMode,
  type FlightState,
  flightVerticalSpeed,
  initialFlight,
  stepFlight,
  verticalImpulse,
} from "./flight";
import { EMPTY_COUNTER, type HitCounter, registerHit } from "./hitCounter";
import { nextGearDown } from "./landingGear";
import {
  initialMotion,
  type MotionResult,
  type MotionState,
  type StepProbe,
  stepFlightMotion,
  stepMotion,
} from "./motion";
import { type RamHit, type RamTarget, selectHits } from "./ram";
import { doorOf, occupiedSeats, vacatedSeats } from "./seats";
import { SPEC } from "./spec";
import { stepHeight } from "./stepUp";

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
  /** Vertical velocity from the engine (blocks/tick). Read whenever the flight mode is not ground, including the tick takeoff starts. */
  velocityY?: number;
  /** Whether the block at entity location + offset (world axes, y from the feet) is solid; air, liquids and blocks without a collision box (flowers, grass, carpets) are not (ADR 0034). */
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
  /** The new flight mode, only on the tick it changes (ADR 0021). */
  flight?: FlightMode;
  /** The new bank angle in degrees, only on the tick it changes and on the first tick (ADR 0026). */
  bank?: number;
  /** Whether the wheels are in the driving pose, only on the tick it changes and on the first tick (ADR 0032). */
  gearDown?: boolean;
}

function stepProbe(ctx: TickContext): StepProbe {
  return (f, speed) => {
    const r = rightOf(f);
    return stepHeight(
      (ahead, side, dy) =>
        ctx.solidAt({
          x: f.x * ahead + r.x * side,
          y: dy,
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
 * 0021). In the air the stick pulled back sinks instead of reversing (ADR 0031).
 */
function driveInputFor(
  raw: RawInput | undefined,
  mode: FlightMode,
): DriveInput {
  if (!raw || mode === "takeoff") return NEUTRAL_INPUT;
  const input = toDriveInput(raw);
  if (mode === "ground") return input;
  return { ...input, throttle: Math.max(0, input.throttle), handbrake: false };
}

export class Vehicle {
  private motion: MotionState;
  private flight: FlightState;
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
    flight: FlightMode = "ground",
  ) {
    this.motion = initialMotion(yaw);
    this.flight = initialFlight(flight);
    this.gearDown = flight === "ground";
  }

  static create(id: string, yaw: number): Vehicle {
    return new Vehicle(id, yaw);
  }

  /**
   * Rebuilds a vehicle whose aggregate was lost (e.g. after `/reload`) while
   * riders may already be seated. Seeding the seats and the driver keeps the
   * first tick from treating the current driver as newly mounted, which would
   * snap the heading to the driver's view. The flight mode comes from the
   * entity, so a vehicle in the air keeps flying (ADR 0021).
   */
  static rebuild(
    id: string,
    yaw: number,
    riders: readonly RiderView[],
    flight: FlightMode = "ground",
  ): Vehicle {
    const v = new Vehicle(id, yaw, flight);
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

  get flightMode(): FlightMode {
    return this.flight.mode;
  }

  /** Whether the wheels are in the driving pose (ADR 0032). */
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
    const before = this.flight.mode;
    this.flight = stepFlight(this.flight, {
      tick: ctx.tick,
      jump: raw?.jump ?? false,
      controlled: raw !== undefined,
      onGround: ctx.onGround,
    });
    const mode = this.flight.mode;
    const input = driveInputFor(raw, mode);
    const yawBefore = this.motion.yaw;
    const step: MotionResult =
      mode === "ground"
        ? stepMotion(
            this.motion,
            input,
            { velocity: ctx.velocity, onGround: ctx.onGround },
            stepProbe(ctx),
          )
        : stepFlightMotion(this.motion, input, ctx.velocity);
    this.motion = step.state;
    this.bank = stepBank(this.bank, mode, yawBefore, this.motion.yaw);
    let impulseY: number;
    if (mode === "ground") {
      impulseY = step.jumpVelocity;
    } else {
      const targetVy = clamp(
        flightVerticalSpeed(mode, climbInput(raw)) - bankSink(mode, this.bank),
        -SPEC.maxClimb,
        SPEC.maxClimb,
      );
      impulseY = verticalImpulse(targetVy, ctx.velocityY ?? 0);
    }
    const bank = this.bank === this.sentBank ? undefined : this.bank;
    this.sentBank = this.bank;
    this.gearDown = nextGearDown(this.gearDown, mode, () =>
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
      flight: mode === before ? undefined : mode,
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
