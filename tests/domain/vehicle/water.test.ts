import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { waterDepthFrom } from "../../../src/domain/vehicle/water";

const feet = fc.double({
  min: -256,
  max: 256,
  noNaN: true,
  noDefaultInfinity: true,
});

describe("waterDepthFrom", () => {
  it("is zero when no cell is water", () => {
    fc.assert(
      fc.property(feet, (feetY) => {
        expect(waterDepthFrom(feetY, () => false)).toBe(0);
      }),
    );
  });

  it("is zero when feet on a full block's top are dry, without checking above them", () => {
    fc.assert(
      fc.property(fc.integer({ min: -256, max: 256 }), (feetY) => {
        const checked: number[] = [];
        expect(
          waterDepthFrom(feetY, (y) => {
            checked.push(y);
            return y !== feetY;
          }),
        ).toBe(0);
        expect(checked).toEqual([feetY]);
      }),
    );
  });

  it("measures water above a dry partial block the feet rest inside from the feet", () => {
    const fraction = fc.double({
      min: 0.01,
      max: 0.99,
      noNaN: true,
      noDefaultInfinity: true,
    });
    fc.assert(
      fc.property(
        fc.integer({ min: -256, max: 256 }),
        fraction,
        fc.integer({ min: 1, max: 10 }),
        (cell, top, cells) => {
          const feetY = cell + top;
          const depth = waterDepthFrom(
            feetY,
            (y) => y > cell && y <= cell + cells,
          );
          const probedCells = Math.min(cells, Math.ceil(SPEC.carHeight) + 1);
          expect(depth).toBeGreaterThan(0);
          expect(depth).toBeCloseTo(
            Math.min(cell + 1 + probedCells - feetY, SPEC.carHeight + 1),
          );
        },
      ),
    );
  });

  it("grows with the contiguous column and measures from fractional feet", () => {
    fc.assert(
      fc.property(feet, fc.integer({ min: 1, max: 10 }), (feetY, cells) => {
        const bottom = Math.floor(feetY);
        const depth = waterDepthFrom(feetY, (y) => y < bottom + cells);
        const probedCells = Math.min(cells, Math.ceil(SPEC.carHeight) + 1);
        expect(depth).toBeCloseTo(
          Math.min(bottom + probedCells - feetY, SPEC.carHeight + 1),
        );
        expect(depth).toBeGreaterThan(0);
        expect(depth).toBeLessThanOrEqual(SPEC.carHeight + 1);
        const shorter = waterDepthFrom(feetY, (y) => y < bottom + cells - 1);
        expect(depth).toBeGreaterThanOrEqual(shorter);
      }),
    );
  });

  it("stops at a gap even when water continues above it", () => {
    fc.assert(
      fc.property(feet, fc.integer({ min: 0, max: 2 }), (feetY, gap) => {
        const bottom = Math.floor(feetY);
        expect(waterDepthFrom(feetY, (y) => y !== bottom + gap)).toBeCloseTo(
          gap > 0
            ? Math.min(bottom + gap - feetY, SPEC.carHeight + 1)
            : feetY === bottom
              ? 0
              : Math.min(
                  bottom + 1 + Math.ceil(SPEC.carHeight) + 1 - feetY,
                  SPEC.carHeight + 1,
                ),
        );
      }),
    );
  });

  it("caps both the depth and the number of probes in deep water", () => {
    fc.assert(
      fc.property(feet, (feetY) => {
        const checked: number[] = [];
        const depth = waterDepthFrom(feetY, (y) => {
          checked.push(y);
          return true;
        });
        expect(depth).toBeGreaterThanOrEqual(0);
        expect(depth).toBeLessThanOrEqual(SPEC.carHeight + 1);
        // Adding zero turns the -0 that Math.floor(-0) probes into +0.
        expect(checked.map((y) => y + 0)).toEqual(
          Array.from(
            { length: Math.ceil(SPEC.carHeight) + 1 },
            (_, i) => Math.floor(feetY) + i,
          ),
        );
      }),
    );
  });

  it("counts the surface cell as full", () => {
    expect(waterDepthFrom(10.75, (y) => y === 10)).toBe(0.25);
  });
});
