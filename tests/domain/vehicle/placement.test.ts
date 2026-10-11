import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canPlaceAt } from "../../../src/domain/vehicle/placement";

const insideFootprint = fc.record({
  dx: fc.integer({ min: -1, max: 1 }),
  dy: fc.integer({ min: 1, max: 2 }),
  dz: fc.integer({ min: -1, max: 1 }),
});

const outsideFootprint = fc
  .record({
    dx: fc.integer({ min: -3, max: 3 }),
    dy: fc.integer({ min: -2, max: 4 }),
    dz: fc.integer({ min: -3, max: 3 }),
  })
  .filter(
    ({ dx, dy, dz }) =>
      Math.abs(dx) > 1 || Math.abs(dz) > 1 || dy < 1 || dy > 2,
  );

const onlyBlocked =
  (b: { dx: number; dy: number; dz: number }) =>
  (dx: number, dy: number, dz: number) =>
    !(dx === b.dx && dy === b.dy && dz === b.dz);

describe("canPlaceAt (ADR 0008, collision box from ADR 0009)", () => {
  it("can place when a 3-wide × 2-high space is clear", () => {
    expect(canPlaceAt(() => true)).toBe(true);
  });

  it("cannot place when any single cell of the 3 × 2 × 3 footprint is blocked", () => {
    fc.assert(
      fc.property(insideFootprint, (b) => {
        expect(canPlaceAt(onlyBlocked(b))).toBe(false);
      }),
    );
  });

  it("can place when the only blocked cell is outside the footprint", () => {
    fc.assert(
      fc.property(outsideFootprint, (b) => {
        expect(canPlaceAt(onlyBlocked(b))).toBe(true);
      }),
    );
  });
});
