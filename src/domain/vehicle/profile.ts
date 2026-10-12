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

/** The sports boat's own values (ADR 0051), written out even where they equal the SUV's today. */
export const SPORTSBOAT_PROFILE: VehicleProfile = {
  kind: "sportsboat",
  motion: {
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
  },
  ram: { front: 3.0, halfWidth: 1.06 }, // ADR 0051
  // Must match minecraft:rideable in packs/yasu_ride_bp/entities/yasu_ride/sportsboat.se.json; the SUV's x/z, no doors (ADR 0051).
  seats: {
    positions: [
      { x: -0.38, z: 0.35 },
      { x: 0.38, z: 0.35 },
      { x: -0.38, z: -0.8 },
      { x: 0.38, z: -0.8 },
    ],
  },
  // Every 4 blocks from 4 to 60 ahead, in two beams 3 blocks either side of the center line (ADR 0051).
  beams: {
    reach: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60],
    lanes: [-3, 3],
  },
};

export const PROFILES: Readonly<Record<VehicleKind, VehicleProfile>> = {
  suv: SUV_PROFILE,
  sportsboat: SPORTSBOAT_PROFILE,
};

export function profileOf(kind: VehicleKind): VehicleProfile {
  return PROFILES[kind];
}
