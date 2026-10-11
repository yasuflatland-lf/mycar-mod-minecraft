import fc from "fast-check";
import { SPEC } from "../../src/domain/vehicle/spec";

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

/** Water depth from dry to a block above the roof (infrastructure caps it at carHeight + 1). */
export const waterDepth = depths(Math.round((SPEC.carHeight + 1) * 1000), [
  0,
  Number.NaN,
  SPEC.floatDraft,
  SPEC.floatDraft - EPSILON,
  SPEC.floatDraft + EPSILON,
  SPEC.carHeight - EPSILON,
  SPEC.carHeight,
  SPEC.carHeight + EPSILON,
]);

/** Water depth below carHeight, where a vehicle that is not a submarine stays out of submarine form. */
export const shallowWaterDepth = depths(Math.round(SPEC.carHeight * 1000) - 1, [
  0,
  Number.NaN,
  SPEC.floatDraft,
  SPEC.carHeight - EPSILON,
]);
