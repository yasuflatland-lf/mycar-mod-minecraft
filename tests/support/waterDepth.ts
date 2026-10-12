import fc from "fast-check";
import type { Vec3 } from "../../src/domain/shared/vec";
import { SUV_SPEC } from "../../src/domain/vehicle/kinds/suv/spec";

const EPSILON = 1e-9;

// fc.double rarely lands between the float line and carHeight, so depths are
// drawn uniformly in millimeters, plus the boundaries and NaN.
function depths(maxMillimeters: number, boundaries: readonly number[]) {
  return fc.oneof(
    {
      arbitrary: fc
        .integer({ min: 0, max: maxMillimeters })
        .map((n) => n / 1000),
      weight: 4,
    },
    { arbitrary: fc.constantFrom(...boundaries), weight: 1 },
  );
}

/** Water depth from dry to a block above the roof (the SUV caps it at carHeight + 1). */
export const waterDepth = depths(Math.round((SUV_SPEC.carHeight + 1) * 1000), [
  0,
  Number.NaN,
  SUV_SPEC.floatDraft,
  SUV_SPEC.floatDraft - EPSILON,
  SUV_SPEC.floatDraft + EPSILON,
  SUV_SPEC.carHeight - EPSILON,
  SUV_SPEC.carHeight,
  SUV_SPEC.carHeight + EPSILON,
]);

/** Water depth below carHeight, where a vehicle that is not a submarine stays out of submarine form. */
export const shallowWaterDepth = depths(
  Math.round(SUV_SPEC.carHeight * 1000) - 1,
  [0, Number.NaN, SUV_SPEC.floatDraft, SUV_SPEC.carHeight - EPSILON],
);

/** Put the surface at y = 0 so fractional depths still end on a cell boundary. */
export function waterSensors(depth = 0, below = false) {
  const location = { x: 0, y: depth > 0 ? -depth : 0, z: 0 };
  return {
    location,
    waterAt: (offset: Vec3) =>
      depth > 0
        ? Math.floor(location.y + offset.y) < 0
        : below && Math.floor(offset.y) === -1,
  };
}
