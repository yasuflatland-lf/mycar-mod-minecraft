import type { PlacementSurface } from "../../placement";
import type { MotionLimits, VehicleProfile } from "../../profile";

/** The sports boat's own values (ADR 0051), written out even where they equal the SUV's today. */
export const SPORTSBOAT_PROFILE: VehicleProfile = Object.freeze({
  kind: "sportsboat",
  fleetLimit: 1, // Per player (ADR 0066).
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

/** The sports boat's own limits (ADR 0051), written out even where they equal the SUV's today. */
export const SPORTSBOAT_MOTION: MotionLimits = Object.freeze({
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
});
