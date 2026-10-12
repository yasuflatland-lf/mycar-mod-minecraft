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

/** The sports boat's own values (ADR 0051), written out even where they equal the SUV's today. */
export const SPORTSBOAT_PROFILE: VehicleProfile = Object.freeze({
  kind: "sportsboat",
  motion: Object.freeze({
    maxSpeed: 1.12, // ADR 0051
    maxReverse: 0.2, // ADR 0051
    accel: 0.0225, // ADR 0051
    reverseAccel: 0.01125, // Half of accel, as on land
    brake: 0.04,
    drag: 0.02,
    turnRate: 6, // degrees/tick at full steering input (ADR 0051)
    steerFullSpeed: 0.08,
    grip: 0.6,
    handbrakeGrip: 0.6, // Equal to grip: the boat has no handbrake
    creepSpeed: 0.12, // Below SPEC.ramMinSpeed, so creeping never rams (ADR 0006)
  }),
  ram: Object.freeze({ front: 3.0, halfWidth: 1.06 }), // ADR 0051
  // Must match minecraft:rideable in packs/yasu_ride_bp/entities/yasu_ride/sportsboat.se.json; the SUV's x/z, no doors (ADR 0051).
  seats: Object.freeze({
    positions: Object.freeze([
      { x: -0.38, z: 0.35 },
      { x: 0.38, z: 0.35 },
      { x: -0.38, z: -0.8 },
      { x: 0.38, z: -0.8 },
    ]),
  }),
  // Every 4 blocks from 4 to 60 ahead, in two beams 3 blocks either side of the center line (ADR 0051).
  beams: Object.freeze({
    reach: Object.freeze([
      4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60,
    ]),
    lanes: Object.freeze([-3, 3]),
  }),
});

export const PROFILES: Readonly<Record<VehicleKind, VehicleProfile>> =
  Object.freeze({
    suv: SUV_PROFILE,
    sportsboat: SPORTSBOAT_PROFILE,
  });

export function profileOf(kind: VehicleKind): VehicleProfile {
  return PROFILES[kind];
}
