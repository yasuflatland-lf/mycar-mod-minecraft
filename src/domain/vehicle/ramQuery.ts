import { SPEC } from "./spec";

/**
 * Radius of the sphere the world is asked for ram targets. It reaches the far
 * corners of the hit box in selectHits, at either height bound, so changing the
 * body or target size in SPEC cannot leave part of the box unqueried (ADR 0006).
 */
export const RAM_QUERY_RADIUS = Math.hypot(
  SPEC.bodyFront + SPEC.targetHalfWidth,
  SPEC.bodyHalfWidth + SPEC.targetHalfWidth,
  Math.max(Math.abs(SPEC.ramMinDy), Math.abs(SPEC.ramMaxDy)),
);
