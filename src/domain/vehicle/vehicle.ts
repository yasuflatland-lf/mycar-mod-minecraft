// src/domain/vehicle/vehicle.ts
// Aggregate: one vehicle. Holds the motion state, the driver, the seats, the record of repeat ram damage, and the hit count.
import { forward, rightOf, type Vec2, type Vec3 } from "../shared/vec";
import { NEUTRAL_INPUT, type RawInput, toDriveInput } from "./driveInput";
import type { VehicleEvent } from "./events";
import { EMPTY_COUNTER, type HitCounter, registerHit } from "./hitCounter";
import {
  initialMotion,
  type MotionState,
  type StepProbe,
  stepMotion,
} from "./motion";
import { type RamHit, type RamTarget, selectHits } from "./ram";
import { DOOR_BY_SEAT, occupiedSeats, vacatedSeats } from "./seats";
import { SPEC } from "./spec";
import { shouldStepUp } from "./stepUp";

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
  /** Whether the position relative to the vehicle is blocked. */
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
}

export class Vehicle {
  private motion: MotionState;
  private driverId: string | undefined;
  private seats = new Map<string, number>();
  private readonly lastHit = new Map<string, number>();
  private hitCounter: HitCounter = EMPTY_COUNTER;

  private constructor(
    readonly id: string,
    yaw: number,
  ) {
    this.motion = initialMotion(yaw);
  }

  static create(id: string, yaw: number): Vehicle {
    return new Vehicle(id, yaw);
  }

  get speed(): number {
    return this.motion.speed;
  }

  get yaw(): number {
    return this.motion.yaw;
  }

  tick(ctx: TickContext): TickOutcome {
    const seats = occupiedSeats(ctx.riders, forward(this.motion.yaw));
    const events: VehicleEvent[] = vacatedSeats(this.seats, seats).map(
      (seat) => ({
        type: "SeatVacated",
        vehicleId: this.id,
        seat,
        door: DOOR_BY_SEAT[seat]!,
      }),
    );
    this.seats = seats;

    // Driver = the rider in the driver's seat (seat 0) (ADR 0007)
    const driver = ctx.riders.find((r) => seats.get(r.id) === 0);
    if (
      driver &&
      this.driverId !== driver.id &&
      Math.abs(this.motion.speed) < SPEC.mountAlignSpeed
    ) {
      this.motion = { ...this.motion, yaw: driver.yaw };
    }
    this.driverId = driver?.id;

    const raw = driver ? driver.raw : ctx.testInput;
    const input = raw ? toDriveInput(raw) : NEUTRAL_INPUT;
    const probe: StepProbe = (f, speed) => {
      const r = rightOf(f);
      return shouldStepUp(
        (ahead, side, dy) =>
          ctx.solidAt({
            x: f.x * ahead + r.x * side,
            y: dy,
            z: f.z * ahead + r.z * side,
          }),
        speed,
      );
    };
    const res = stepMotion(
      this.motion,
      input,
      { velocity: ctx.velocity, onGround: ctx.onGround },
      probe,
    );
    this.motion = res.state;

    for (const [id, t] of this.lastHit)
      if (ctx.tick - t >= SPEC.ramCooldown) this.lastHit.delete(id);
    const hits =
      Math.abs(res.state.speed) > SPEC.ramMinSpeed
        ? selectHits(
            res.forward,
            res.state.speed,
            ctx.targets(),
            this.lastHit,
            ctx.tick,
          )
        : [];
    for (const h of hits) this.lastHit.set(h.id, ctx.tick);

    return {
      impulse: {
        x: res.impulse.x,
        y: res.jumped ? SPEC.stepVelocity : 0,
        z: res.impulse.z,
      },
      yaw: res.state.yaw,
      hits,
      driverId: driver?.id,
      events,
    };
  }

  /** Hit by a player. Returns VehicleBroken when the vehicle breaks (ADR 0008). */
  receiveHit(tick: number): VehicleEvent[] {
    const r = registerHit(this.hitCounter, tick, this.seats.size > 0);
    this.hitCounter = r.counter;
    return r.broken ? [{ type: "VehicleBroken", vehicleId: this.id }] : [];
  }
}
