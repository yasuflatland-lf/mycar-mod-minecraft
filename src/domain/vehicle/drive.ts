// How one vehicle kind moves each tick, under the shared core in vehicle.ts (ADR 0050).
import type { Vec2, Vec3 } from "../shared/vec";
import { BoatDrive } from "./boatDrive";
import type { RawInput } from "./driveInput";
import type { Form } from "./form";
import type { VehicleKind } from "./kind";
import type { MotionState } from "./motion";
import type { VehicleProfile } from "./profile";
import { SuvDrive } from "./suvDrive";
import type { TickContext } from "./vehicle";

export interface DriveResult {
  motion: MotionState;
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
  /** "car" for kinds without forms. */
  readonly form: Form;
  /** True for kinds without landing gear. */
  readonly wheelsDown: boolean;
  /** 0 for kinds that never bank. */
  readonly bankAngle: number;
  step(
    motion: MotionState,
    raw: RawInput | undefined,
    ctx: TickContext,
    profile: VehicleProfile,
  ): DriveResult;
}

export function driveFor(kind: VehicleKind, form: Form): Drive {
  switch (kind) {
    case "suv":
      return new SuvDrive(form);
    case "sportsboat":
      return new BoatDrive();
  }
}
