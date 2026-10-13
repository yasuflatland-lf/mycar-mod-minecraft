// Aggregate for one vehicle: its drive, driver, seats, ram cooldowns, and the hit count.
import { forward, type Vec2, type Vec3 } from "../shared/vec";
import type { Dock } from "./dock";
import type { Drive, EngineCommand, RiderState, TickContext } from "./drive";
import type { RawInput } from "./driveInput";
import type { VehicleEvent } from "./events";
import { EMPTY_COUNTER, type HitCounter, registerHit } from "./hitCounter";
import type { VehicleKind } from "./kind";
import type { VehicleProfile } from "./profile";
import { type RamHit, selectHits } from "./ram";
import { occupiedSeats, vacatedSeats } from "./seats";
import { SPEC } from "./spec";

export interface RiderView {
  id: string;
  offset: Vec2;
  yaw: number;
  raw: RawInput;
}

export interface VehicleTickInput extends TickContext {
  riders: readonly RiderView[];
  /** Input used only when there is no driver (for in-game tests). */
  testInput?: RawInput;
}

export interface TickOutcome {
  dock?: Dock;
  boardDeckRiders: boolean;
  impulse: Vec3;
  yaw: number;
  hits: RamHit[];
  driverId?: string;
  commands: readonly EngineCommand[];
  seatCommands: readonly EngineCommand[];
  riders: RiderState;
}

export class Vehicle {
  private driverId: string | undefined;
  private seats = new Map<string, number>();
  private readonly lastHit = new Map<string, number>();
  private hitCounter: HitCounter = EMPTY_COUNTER;
  private lastSwitchUseTick = Number.NEGATIVE_INFINITY;

  /** Called only by kinds/index.ts, which picks the drive for the kind. */
  constructor(
    readonly id: string,
    private readonly profile: VehicleProfile,
    private readonly drive: Drive,
  ) {}

  /**
   * Seats riders who were already aboard when the aggregate was lost (e.g.
   * after `/reload`), so the first tick does not treat the current driver as
   * newly mounted, which would snap the heading to the driver's view. Called
   * only by kinds/index.ts. `yaw` is the entity's heading as read, before the
   * drive normalizes it.
   */
  seatRiders(riders: readonly RiderView[], yaw: number): void {
    this.seats = occupiedSeats(
      riders,
      forward(yaw),
      this.profile.seats.positions,
    );
    this.driverId = riders.find((r) => this.seats.get(r.id) === 0)?.id;
  }

  get kind(): VehicleKind {
    return this.profile.kind;
  }

  get speed(): number {
    return this.drive.speed;
  }

  get yaw(): number {
    return this.drive.yaw;
  }

  tick(input: VehicleTickInput): TickOutcome {
    const seatCommands = this.updateSeats(input.riders);
    const driver = this.updateDriver(input.riders);

    const raw = driver?.raw ?? input.testInput;
    const taken = new Set(this.seats.values());
    const step = this.drive.step(raw, {
      ...input,
      deckSeatInputs: input.deckSeatInputs.map((deckInput, seat) =>
        taken.has(seat) ? undefined : deckInput,
      ),
    });

    return {
      dock: step.dock && {
        ...step.dock,
        seats: step.dock.seats.map((at, seat) =>
          taken.has(seat) ? undefined : at,
        ),
      },
      boardDeckRiders: step.boardDeckRiders ?? false,
      impulse: step.impulse,
      yaw: this.drive.yaw,
      hits: this.ram(input, step.forward),
      driverId: driver?.id,
      commands: step.commands,
      seatCommands,
      riders: step.riders,
    };
  }

  private updateSeats(riders: readonly RiderView[]): readonly EngineCommand[] {
    const seats = occupiedSeats(
      riders,
      forward(this.drive.yaw),
      this.profile.seats.positions,
    );
    const commands = vacatedSeats(this.seats, seats)
      .sort((a, b) => a - b)
      .flatMap((seat) => this.drive.onSeatVacated(seat));
    this.seats = seats;
    return commands;
  }

  private updateDriver(riders: readonly RiderView[]): RiderView | undefined {
    // Driver = the rider in the driver's seat (seat 0) (ADR 0019). A driver
    // stays the driver while they ride: a rider's position can lag the moving
    // vehicle by a tick and read as another seat, which in flight would land
    // the vehicle (ADR 0025).
    const driver =
      riders.find((r) => r.id === this.driverId) ??
      riders.find((r) => this.seats.get(r.id) === 0);
    if (driver && this.driverId !== driver.id)
      this.drive.onDriverMounted(driver.yaw);
    this.driverId = driver?.id;
    return driver;
  }

  private ram(ctx: TickContext, f: Vec2): RamHit[] {
    for (const [id, t] of this.lastHit)
      if (ctx.tick - t >= SPEC.ramCooldown) this.lastHit.delete(id);
    // selectHits checks the speed too; checking here skips the targets() query.
    if (Math.abs(this.drive.speed) <= SPEC.ramMinSpeed) return [];
    const hits = selectHits(
      f,
      this.drive.speed,
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
