// How one vehicle kind moves each tick, under the shared core in vehicle.ts (ADR 0050, 0055).
import type { Vec2, Vec3 } from "../shared/vec";
import type { RawInput } from "./driveInput";
import type { Form } from "./form";
import type { RamTarget } from "./ram";

/** Sensors only. Riders and test input stay with the core. */
export interface TickContext {
  tick: number;
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

export interface DriveStep {
  impulse: Vec3;
  /** The facing used for the ram this tick. */
  forward: Vec2;
  /** Only on the tick the form changes (ADR 0021). */
  form?: Form;
  /** Only when changed, and on the first tick (ADR 0026). */
  bank?: number;
  /** Only when changed, and on the first tick (ADR 0033). */
  gearDown?: boolean;
}

export interface Drive {
  /** Internal forward/reverse speed in blocks/tick; negative means reverse. */
  readonly speed: number;
  readonly yaw: number;
  /** "car" for kinds without forms. */
  readonly form: Form;
  /** True for kinds without landing gear. */
  readonly wheelsDown: boolean;
  /** 0 for kinds that never bank. */
  readonly bankAngle: number;
  /** Called when a new driver takes seat 0. */
  onDriverMounted(driverYaw: number): void;
  step(raw: RawInput | undefined, ctx: TickContext): DriveStep;
}
