import type { PlacementSurface } from "../../placement";
import type { MotionLimits, VehicleProfile } from "../../profile";
import { SEAT_POSITIONS } from "../../seats";
import { SUV_SPEC } from "./spec";

// Frozen because this one object is shared by every SUV; a write would change
// all of them at once and leave RAM_QUERY_RADIUS, computed at load, stale.
export const SUV_PROFILE: VehicleProfile = Object.freeze({
  kind: "suv",
  ram: Object.freeze({
    front: SUV_SPEC.bodyFront,
    halfWidth: SUV_SPEC.bodyHalfWidth,
  }),
  seats: Object.freeze({ positions: SEAT_POSITIONS }),
  beams: Object.freeze({
    reach: SUV_SPEC.headlightReach,
    lanes: Object.freeze([0]),
  }),
  // On the top face of a block only (ADR 0008).
  placement: Object.freeze({
    surfaces: Object.freeze<PlacementSurface[]>(["top"]),
    // 3 × 2 × 3 cells fit the 1.8-wide, 1.6-high collision box (ADR 0009).
    clearance: Object.freeze({ halfX: 1, halfZ: 1, height: 2 }),
  }),
});

// Frozen because every SUV drive shares this one object.
export const SUV_MOTION: MotionLimits = Object.freeze({
  maxSpeed: SUV_SPEC.maxSpeed,
  maxReverse: SUV_SPEC.maxReverse,
  accel: SUV_SPEC.accel,
  reverseAccel: SUV_SPEC.reverseAccel,
  brake: SUV_SPEC.brake,
  drag: SUV_SPEC.drag,
  turnRate: SUV_SPEC.turnRate,
  steerFullSpeed: SUV_SPEC.steerFullSpeed,
  grip: SUV_SPEC.grip,
  handbrakeGrip: SUV_SPEC.handbrakeGrip,
  creepSpeed: SUV_SPEC.creepSpeed,
});
