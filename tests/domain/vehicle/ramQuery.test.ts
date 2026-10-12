import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward, rightOf } from "../../../src/domain/shared/vec";
import { RAM_QUERY_RADIUS } from "../../../src/domain/vehicle/kinds/index";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../../src/domain/vehicle/kinds/suv/spec";
import { selectHits } from "../../../src/domain/vehicle/ram";
import { SPEC } from "../../../src/domain/vehicle/spec";

const reach = SUV_SPEC.bodyFront + SPEC.targetHalfWidth;
const halfWidth = SUV_SPEC.bodyHalfWidth + SPEC.targetHalfWidth;

// Mixes in the exact bounds so the far corners, where the sphere is tightest, are drawn often.
const within = (min: number, max: number) =>
  fc.oneof(fc.constantFrom(min, max), fc.double({ min, max, noNaN: true }));

function offsetAt(yawDeg: number, ahead: number, side: number, dy: number) {
  const f = forward(yawDeg);
  const r = rightOf(f);
  return {
    f,
    offset: {
      x: f.x * ahead + r.x * side,
      y: dy,
      z: f.z * ahead + r.z * side,
    },
  };
}

describe("RAM_QUERY_RADIUS", () => {
  it("contains every target that selectHits would hit", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -180, max: 180, noNaN: true }),
        within(0, reach),
        within(-halfWidth, halfWidth),
        within(SPEC.ramMinDy, SPEC.ramMaxDy),
        fc.boolean(),
        (yawDeg, ahead, side, dy, reversing) => {
          const speed = reversing ? -SUV_SPEC.maxReverse : SUV_SPEC.maxSpeed;
          const { f, offset } = offsetAt(
            yawDeg,
            reversing ? -ahead : ahead,
            side,
            dy,
          );
          const hits = selectHits(
            f,
            speed,
            [{ id: "t", offset, protectedOccupant: false }],
            new Map(),
            0,
            SUV_PROFILE.ram,
          );
          fc.pre(hits.length === 1);
          expect(Math.hypot(offset.x, offset.y, offset.z)).toBeLessThanOrEqual(
            RAM_QUERY_RADIUS + 1e-9,
          );
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("reaches the top front corner of the hit box", () => {
    const { f, offset } = offsetAt(0, reach, halfWidth, SPEC.ramMaxDy);
    expect(
      selectHits(
        f,
        SUV_SPEC.maxSpeed,
        [{ id: "t", offset, protectedOccupant: false }],
        new Map(),
        0,
        SUV_PROFILE.ram,
      ),
    ).toHaveLength(1);
    expect(Math.hypot(offset.x, offset.y, offset.z)).toBeLessThanOrEqual(
      RAM_QUERY_RADIUS + 1e-9,
    );
  });
});
