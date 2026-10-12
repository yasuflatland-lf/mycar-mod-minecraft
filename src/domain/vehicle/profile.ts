import type { Vec2 } from "../shared/vec";
import type { VehicleKind } from "./kind";
import { DOOR_BY_SEAT, SEAT_POSITIONS } from "./seats";
import { SPEC } from "./spec";

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
  /** Door bone per seat; absent for kinds without doors. */
  readonly doors?: readonly string[];
}

export interface BeamPattern {
  /** Blocks ahead of the center. */
  readonly reach: readonly number[];
  /** Sideways offsets in blocks. */
  readonly lanes: readonly number[];
}

export interface VehicleProfile {
  readonly kind: VehicleKind;
  readonly motion: MotionLimits;
  readonly ram: RamBody;
  readonly seats: SeatLayout;
  readonly beams: BeamPattern;
}

// Frozen because this one object is the default argument of the motion, ram
// and headlight functions and is shared by every SUV; a write would change all
// of them at once and leave RAM_QUERY_RADIUS, computed at load, stale.
export const SUV_PROFILE: VehicleProfile = Object.freeze({
  kind: "suv",
  motion: Object.freeze({
    maxSpeed: SPEC.maxSpeed,
    maxReverse: SPEC.maxReverse,
    accel: SPEC.accel,
    reverseAccel: SPEC.reverseAccel,
    brake: SPEC.brake,
    drag: SPEC.drag,
    turnRate: SPEC.turnRate,
    steerFullSpeed: SPEC.steerFullSpeed,
    grip: SPEC.grip,
    handbrakeGrip: SPEC.handbrakeGrip,
    creepSpeed: SPEC.creepSpeed,
  }),
  ram: Object.freeze({ front: SPEC.bodyFront, halfWidth: SPEC.bodyHalfWidth }),
  seats: Object.freeze({ positions: SEAT_POSITIONS, doors: DOOR_BY_SEAT }),
  beams: Object.freeze({
    reach: SPEC.headlightReach,
    lanes: Object.freeze([0]),
  }),
});

export const PROFILES: Readonly<Record<VehicleKind, VehicleProfile>> =
  Object.freeze({
    suv: SUV_PROFILE,
  });

export function profileOf(kind: VehicleKind): VehicleProfile {
  return PROFILES[kind];
}
