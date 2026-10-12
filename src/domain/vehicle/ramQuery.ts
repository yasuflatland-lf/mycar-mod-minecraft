import { PROFILES } from "./profile";
import { SPEC } from "./spec";

const RAM_HEIGHT_REACH = Math.max(
  Math.abs(SPEC.ramMinDy),
  Math.abs(SPEC.ramMaxDy),
);

/**
 * Reaches the far corners of every profile's ram hit box at either height
 * bound, so a longer or wider kind cannot be missed by the world query (ADR 0006).
 */
export const RAM_QUERY_RADIUS = Math.max(
  ...Object.values(PROFILES).map(({ ram }) =>
    Math.hypot(
      ram.front + SPEC.targetHalfWidth,
      ram.halfWidth + SPEC.targetHalfWidth,
      RAM_HEIGHT_REACH,
    ),
  ),
);
