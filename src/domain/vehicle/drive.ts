// How one vehicle kind moves each tick, under the shared core in vehicle.ts (ADR 0050, 0055).
import type { Vec2, Vec3 } from "../shared/vec";
import type { Dock } from "./dock";
import type { RawInput } from "./driveInput";
import type { RamTarget } from "./ram";

/** Sensors and inputs from auxiliary seats. Vehicle riders stay with the core. */
export interface TickContext {
  tick: number;
  deckSeatInputs: readonly (RawInput | undefined)[];
  /** Entity feet in world coordinates. */
  location: Vec3;
  /** Engine velocity in blocks/tick. */
  velocity: Vec3;
  onGround: boolean;
  /** Whether the block at entity location + offset (world axes, y from the feet) is solid; air, liquids and blocks without a collision box (flowers, grass, carpets) are not (ADR 0035). */
  solidAt(offset: Vec3): boolean;
  /** Water, flowing water, bubble columns, or waterlogged blocks at floor(location + offset). */
  waterAt(offset: Vec3): boolean;
  /** Nearby targets. Called only when the speed exceeds the ram threshold. */
  targets(): readonly RamTarget[];
}

export type EngineCommand =
  | { type: "setProperty"; name: string; value: number | boolean | string }
  | { type: "triggerEvent"; name: string }
  | { type: "playAnimation"; name: string }
  | { type: "playSound"; name: string }; // at the vehicle's location

/** Entity properties read back when an aggregate is rebuilt (ADR 0021, 0055). */
export type RestoredValues = Readonly<
  Record<string, string | number | boolean | undefined>
>;

export interface RiderState {
  thirdPerson: boolean;
  underwater: boolean;
}

export interface DriveStep {
  dock?: Dock;
  /** Moves every deck seat rider into the vehicle this tick (ADR 0063). */
  boardDeckRiders?: boolean;
  impulse: Vec3;
  /** The facing used for the ram this tick. */
  forward: Vec2;
  commands: readonly EngineCommand[];
  riders: RiderState;
}

export interface Drive {
  /** Internal forward/reverse speed in blocks/tick; negative means reverse. */
  readonly speed: number;
  readonly yaw: number;
  /** Called when a new driver takes seat 0. */
  onDriverMounted(driverYaw: number): void;
  onSeatVacated(seat: number): readonly EngineCommand[];
  step(raw: RawInput | undefined, ctx: TickContext): DriveStep;
}
