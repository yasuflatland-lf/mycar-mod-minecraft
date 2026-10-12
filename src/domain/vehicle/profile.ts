import type { Vec2 } from "../shared/vec";
import type { VehicleKind } from "./kind";
import type { PlacementRule, PlacementSurface } from "./placement";
import { SEAT_POSITIONS } from "./seats";
import { SPEC } from "./spec";

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
  readonly ram: RamBody;
  readonly seats: SeatLayout;
  readonly beams: BeamPattern;
  readonly placement: PlacementRule;
}

// Frozen because this one object is shared by every SUV; a write would change
// all of them at once and leave RAM_QUERY_RADIUS, computed at load, stale.
export const SUV_PROFILE: VehicleProfile = Object.freeze({
  kind: "suv",
  ram: Object.freeze({ front: SPEC.bodyFront, halfWidth: SPEC.bodyHalfWidth }),
  seats: Object.freeze({ positions: SEAT_POSITIONS }),
  beams: Object.freeze({
    reach: SPEC.headlightReach,
    lanes: Object.freeze([0]),
  }),
  // On the top face of a block only (ADR 0008).
  placement: Object.freeze({
    surfaces: Object.freeze<PlacementSurface[]>(["top"]),
    // 3 × 2 × 3 cells fit the 1.8-wide, 1.6-high collision box (ADR 0009).
    clearance: Object.freeze({ halfX: 1, halfZ: 1, height: 2 }),
  }),
});

/** The sports boat's own values (ADR 0051), written out even where they equal the SUV's today. */
export const SPORTSBOAT_PROFILE: VehicleProfile = Object.freeze({
  kind: "sportsboat",
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
  // At the water surface from the bed, the water, or the side of a shore; on land from a top face (ADR 0051).
  placement: Object.freeze({
    surfaces: Object.freeze<PlacementSurface[]>(["water", "top"]),
    // 3 × 2 × 3 cells fit the 2.2-wide, 1.2-high collision box (ADR 0051).
    clearance: Object.freeze({ halfX: 1, halfZ: 1, height: 2 }),
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
