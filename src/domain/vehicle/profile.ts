import type { Vec2 } from "../shared/vec";
import type { VehicleKind } from "./kind";
import type { PlacementRule } from "./placement";

/** Each drive holds its own value (ADR 0055). */
export interface MotionLimits {
  readonly maxSpeed: number;
  readonly maxReverse: number;
  readonly accel: number;
  readonly reverseAccel: number;
  readonly brake: number;
  readonly drag: number;
  readonly turnRate: number;
  readonly steerFullSpeed: number;
  readonly grip: number;
  readonly handbrakeGrip: number;
  readonly creepSpeed: number;
}

/** Body dimensions from the center, in blocks. */
export interface RamBody {
  readonly front: number;
  readonly halfWidth: number;
}

export interface SeatLayout {
  /** x = left, z = forward; index 0 is the driver. */
  readonly positions: readonly Vec2[];
}

export interface BeamPattern {
  /** Blocks ahead of the center. */
  readonly reach: readonly number[];
  /** Sideways offsets in blocks. */
  readonly lanes: readonly number[];
}

export interface VehicleProfile {
  readonly kind: VehicleKind;
  /** Most vehicles of this kind one player keeps; one more removes their oldest (ADR 0066). */
  readonly fleetLimit: number;
  readonly ram: RamBody;
  readonly seats: SeatLayout;
  readonly beams: BeamPattern;
  readonly placement: PlacementRule;
}
