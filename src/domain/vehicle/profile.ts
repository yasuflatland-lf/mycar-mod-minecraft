import type { Vec2 } from "../shared/vec";
import type { VehicleKind } from "./kind";
import { DOOR_BY_SEAT, SEAT_POSITIONS } from "./seats";
import { SPEC } from "./spec";

export interface MotionLimits {
  maxSpeed: number;
  maxReverse: number;
  accel: number;
  reverseAccel: number;
  brake: number;
  drag: number;
  turnRate: number;
  steerFullSpeed: number;
  grip: number;
  handbrakeGrip: number;
  creepSpeed: number;
}

/** Body dimensions from the center, in blocks. */
export interface RamBody {
  front: number;
  halfWidth: number;
}

export interface SeatLayout {
  /** x = left, z = forward; index 0 is the driver. */
  positions: readonly Vec2[];
  /** Door bone per seat; absent for kinds without doors. */
  doors?: readonly string[];
}

export interface BeamPattern {
  /** Blocks ahead of the center. */
  reach: readonly number[];
  /** Sideways offsets in blocks. */
  lanes: readonly number[];
}

export interface VehicleProfile {
  kind: VehicleKind;
  motion: MotionLimits;
  ram: RamBody;
  seats: SeatLayout;
  beams: BeamPattern;
}

export const SUV_PROFILE: VehicleProfile = {
  kind: "suv",
  motion: {
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
  },
  ram: { front: SPEC.bodyFront, halfWidth: SPEC.bodyHalfWidth },
  seats: { positions: SEAT_POSITIONS, doors: DOOR_BY_SEAT },
  beams: { reach: SPEC.headlightReach, lanes: [0] },
};

export const PROFILES: Readonly<Record<VehicleKind, VehicleProfile>> = {
  suv: SUV_PROFILE,
};

export function profileOf(kind: VehicleKind): VehicleProfile {
  return PROFILES[kind];
}
