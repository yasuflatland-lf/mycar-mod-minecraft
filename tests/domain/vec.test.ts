// tests/domain/vec.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clampLength, dot, forward, leftOf, length, normalizeYaw, rightOf } from "../../src/domain/shared/vec";

const yaw = fc.double({ min: -720, max: 720, noNaN: true });

describe("vec", () => {
  it("yaw 0 は +z (南)、yaw -90 は +x (東) を向く", () => {
    expect(forward(0).x).toBeCloseTo(0);
    expect(forward(0).z).toBeCloseTo(1);
    expect(forward(-90).x).toBeCloseTo(1);
    expect(forward(-90).z).toBeCloseTo(0);
  });

  it("南を向いたとき、右は西 (-x)、左は東 (+x)", () => {
    expect(rightOf(forward(0)).x).toBeCloseTo(-1);
    expect(leftOf(forward(0)).x).toBeCloseTo(1);
  });

  it("forward は単位ベクトルで、rightOf と直交する", () => {
    fc.assert(fc.property(yaw, (y) => {
      const f = forward(y);
      expect(length(f)).toBeCloseTo(1, 9);
      expect(dot(f, rightOf(f))).toBeCloseTo(0, 9);
    }));
  });

  it("clampLength は上限を超えず、向きを変えない", () => {
    const v = fc.record({ x: fc.double({ min: -5, max: 5, noNaN: true }), z: fc.double({ min: -5, max: 5, noNaN: true }) });
    fc.assert(fc.property(v, fc.double({ min: 0.01, max: 2, noNaN: true }), (a, max) => {
      const c = clampLength(a, max);
      expect(length(c)).toBeLessThanOrEqual(max + 1e-9);
      expect(a.x * c.z - a.z * c.x).toBeCloseTo(0, 9);
    }));
  });

  it("normalizeYaw は (-180, 180] に収め、同じ向きを表す", () => {
    fc.assert(fc.property(fc.double({ min: -1e5, max: 1e5, noNaN: true }), (y) => {
      const n = normalizeYaw(y);
      expect(n).toBeGreaterThan(-180);
      expect(n).toBeLessThanOrEqual(180);
      expect(forward(n).x).toBeCloseTo(forward(y).x, 6);
      expect(forward(n).z).toBeCloseTo(forward(y).z, 6);
    }));
  });
});
