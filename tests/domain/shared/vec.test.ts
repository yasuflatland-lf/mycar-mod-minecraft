import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  clampLength,
  dot,
  forward,
  leftOf,
  length,
  normalizeYaw,
  rightOf,
} from "../../../src/domain/shared/vec";

const yaw = fc.double({ min: -720, max: 720, noNaN: true });

describe("vec", () => {
  it("yaw 0 points toward +z (south), and yaw -90 points toward +x (east)", () => {
    expect(forward(0).x).toBeCloseTo(0);
    expect(forward(0).z).toBeCloseTo(1);
    expect(forward(-90).x).toBeCloseTo(1);
    expect(forward(-90).z).toBeCloseTo(0);
  });

  it("when facing south, right is west (-x) and left is east (+x)", () => {
    expect(rightOf(forward(0)).x).toBeCloseTo(-1);
    expect(leftOf(forward(0)).x).toBeCloseTo(1);
  });

  it("forward is a unit vector perpendicular to rightOf", () => {
    fc.assert(
      fc.property(yaw, (y) => {
        const f = forward(y);
        expect(length(f)).toBeCloseTo(1, 9);
        expect(dot(f, rightOf(f))).toBeCloseTo(0, 9);
      }),
    );
  });

  it("clampLength stays within the upper limit and preserves direction", () => {
    const v = fc.record({
      x: fc.double({ min: -5, max: 5, noNaN: true }),
      z: fc.double({ min: -5, max: 5, noNaN: true }),
    });
    fc.assert(
      fc.property(
        v,
        fc.double({ min: 0.01, max: 2, noNaN: true }),
        (a, max) => {
          const c = clampLength(a, max);
          expect(length(c)).toBeLessThanOrEqual(max + 1e-9);
          expect(a.x * c.z - a.z * c.x).toBeCloseTo(0, 9);
        },
      ),
    );
  });

  it("normalizeYaw keeps yaw within (-180, 180] and preserves direction", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e5, max: 1e5, noNaN: true }), (y) => {
        const n = normalizeYaw(y);
        expect(n).toBeGreaterThan(-180);
        expect(n).toBeLessThanOrEqual(180);
        expect(forward(n).x).toBeCloseTo(forward(y).x, 6);
        expect(forward(n).z).toBeCloseTo(forward(y).z, 6);
      }),
    );
  });

  it("left is the exact opposite of right for every heading", () => {
    fc.assert(
      // Whole degrees off the half turns: the double `yaw` arbitrary leans on
      // 0 and ±720, where sin(yaw) is 0 and a wrong sign on z goes unseen.
      fc.property(
        fc.integer({ min: -719, max: 719 }).filter((d) => d % 180 !== 0),
        (y) => {
          const f = forward(y);
          const left = leftOf(f);
          const right = rightOf(f);
          expect(left.x).toBeCloseTo(-right.x, 9);
          expect(left.z).toBeCloseTo(-right.z, 9);
        },
      ),
    );
  });

  it("normalizeYaw maps every half turn to 180, never -180", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (turns) => {
        expect(normalizeYaw(180 + 360 * turns)).toBe(180);
      }),
    );
  });
});
