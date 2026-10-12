// Aggregate for one vehicle: motion, driver, seats, ram cooldowns, and the hit count.
import { forward, type Vec2, type Vec3 } from "../shared/vec";
import { type Drive, driveFor } from "./drive";
import type { RawInput } from "./driveInput";
import type { VehicleEvent } from "./events";
import type { Form } from "./form";
import { EMPTY_COUNTER, type HitCounter, registerHit } from "./hitCounter";
import type { VehicleKind } from "./kind";
import { initialMotion, type MotionState } from "./motion";
import { profileOf, type VehicleProfile } from "./profile";
import { type RamHit, type RamTarget, selectHits } from "./ram";
import { doorOf, occupiedSeats, vacatedSeats } from "./seats";
import { SPEC } from "./spec";

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
  /** Whether the cell 0.3 blocks below the feet holds water; a floating hull's feet can sit above the water cell (ADR 0051). */
  waterBelow?: boolean;
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

export class Vehicle {
  private readonly profile: VehicleProfile;
  private motion: MotionState;
  private readonly drive: Drive;
  private driverId: string | undefined;
  private seats = new Map<string, number>();
  private readonly lastHit = new Map<string, number>();
  private hitCounter: HitCounter = EMPTY_COUNTER;
  private lastSwitchUseTick = Number.NEGATIVE_INFINITY;

  private constructor(
    readonly id: string,
    yaw: number,
    form: Form,
    kind: VehicleKind,
  ) {
    this.profile = profileOf(kind);
    this.motion = initialMotion(yaw);
    this.drive = driveFor(kind, form);
  }

  static create(id: string, yaw: number, kind: VehicleKind): Vehicle {
    return new Vehicle(id, yaw, "car", kind);
  }

  /**
   * Rebuilds a vehicle whose aggregate was lost (e.g. after `/reload`) while
   * riders may already be seated. Seeding the seats and the driver keeps the
   * first tick from treating the current driver as newly mounted, which would
   * snap the heading to the driver's view. The vehicle form comes from the
   * entity, so a vehicle in the air keeps flying (ADR 0021); kinds without
   * forms ignore it.
   */
  static rebuild(
    id: string,
    yaw: number,
    riders: readonly RiderView[],
    form: Form,
    kind: VehicleKind,
  ): Vehicle {
    const v = new Vehicle(id, yaw, form, kind);
    v.seats = occupiedSeats(riders, forward(yaw), v.profile.seats.positions);
    v.driverId = riders.find((r) => v.seats.get(r.id) === 0)?.id;
    return v;
  }

  get kind(): VehicleKind {
    return this.profile.kind;
  }

  get speed(): number {
    return this.motion.speed;
  }

  get yaw(): number {
    return this.motion.yaw;
  }

  get form(): Form {
    return this.drive.form;
  }

  /** Whether the wheels are in the driving pose (ADR 0033). */
  get wheelsDown(): boolean {
    return this.drive.wheelsDown;
  }

  /** Bank angle in degrees; positive lowers the right side (ADR 0026). */
  get bankAngle(): number {
    return this.drive.bankAngle;
  }

  tick(ctx: TickContext): TickOutcome {
    const events = this.updateSeats(ctx.riders);
    const driver = this.updateDriver(ctx.riders);

    const raw = driver?.raw ?? ctx.testInput;
    const r = this.drive.step(this.motion, raw, ctx, this.profile);
    this.motion = r.motion;

    return {
      impulse: r.impulse,
      yaw: this.motion.yaw,
      hits: this.ram(ctx, r.forward),
      driverId: driver?.id,
      events,
      form: r.form,
      bank: r.bank,
      gearDown: r.gearDown,
    };
  }

  private updateSeats(riders: readonly RiderView[]): VehicleEvent[] {
    const seats = occupiedSeats(
      riders,
      forward(this.motion.yaw),
      this.profile.seats.positions,
    );
    const events: VehicleEvent[] = vacatedSeats(this.seats, seats).map(
      (seat) => {
        const door = doorOf(seat, this.profile.seats.doors ?? []);
        return {
          type: "SeatVacated",
          vehicleId: this.id,
          seat,
          ...(door !== undefined ? { door } : {}),
        };
      },
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
      this.profile.ram,
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
