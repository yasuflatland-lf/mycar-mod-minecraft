import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SUV_SPEC } from "../../../../src/domain/vehicle/kinds/suv/spec";
import {
  waterBelowAt,
  waterDepthAt,
} from "../../../../src/domain/vehicle/motion/water";

const feet = fc.double({
  min: -256,
  max: 256,
  noNaN: true,
  noDefaultInfinity: true,
});

describe("waterDepthAt", () => {
  it("is zero when no cell is water", () => {
    fc.assert(
      fc.property(feet, (feetY) => {
        expect(depthFromCells(feetY, () => false)).toBe(0);
      }),
    );
  });

  it("is zero when feet on a full block's top are dry, without checking above them", () => {
    fc.assert(
      fc.property(fc.integer({ min: -256, max: 256 }), (feetY) => {
        const checked: number[] = [];
        expect(
          depthFromCells(feetY, (y) => {
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
          const depth = depthFromCells(
            feetY,
            (y) => y > cell && y <= cell + cells,
          );
          const probedCells = Math.min(
            cells,
            Math.ceil(SUV_SPEC.carHeight) + 1,
          );
          expect(depth).toBeGreaterThan(0);
          expect(depth).toBeCloseTo(
            Math.min(cell + 1 + probedCells - feetY, SUV_SPEC.carHeight + 1),
          );
        },
      ),
    );
  });

  it("grows with the contiguous column and measures from fractional feet", () => {
    fc.assert(
      fc.property(feet, fc.integer({ min: 1, max: 10 }), (feetY, cells) => {
        const bottom = Math.floor(feetY);
        const depth = depthFromCells(feetY, (y) => y < bottom + cells);
        const probedCells = Math.min(cells, Math.ceil(SUV_SPEC.carHeight) + 1);
        expect(depth).toBeCloseTo(
          Math.min(bottom + probedCells - feetY, SUV_SPEC.carHeight + 1),
        );
        expect(depth).toBeGreaterThan(0);
        expect(depth).toBeLessThanOrEqual(SUV_SPEC.carHeight + 1);
        const shorter = depthFromCells(feetY, (y) => y < bottom + cells - 1);
        expect(depth).toBeGreaterThanOrEqual(shorter);
      }),
    );
  });

  it("stops at a gap even when water continues above it", () => {
    fc.assert(
      fc.property(feet, fc.integer({ min: 0, max: 2 }), (feetY, gap) => {
        const bottom = Math.floor(feetY);
        expect(depthFromCells(feetY, (y) => y !== bottom + gap)).toBeCloseTo(
          gap > 0
            ? Math.min(bottom + gap - feetY, SUV_SPEC.carHeight + 1)
            : feetY === bottom
              ? 0
              : Math.min(
                  bottom + 1 + Math.ceil(SUV_SPEC.carHeight) + 1 - feetY,
                  SUV_SPEC.carHeight + 1,
                ),
        );
      }),
    );
  });

  it("caps both the depth and the number of probes in deep water", () => {
    fc.assert(
      fc.property(feet, (feetY) => {
        const checked: number[] = [];
        const depth = depthFromCells(feetY, (y) => {
          checked.push(y);
          return true;
        });
        expect(depth).toBeGreaterThanOrEqual(0);
        expect(depth).toBeLessThanOrEqual(SUV_SPEC.carHeight + 1);
        // Adding zero turns the -0 that Math.floor(-0) probes into +0.
        expect(checked.map((y) => y + 0)).toEqual(
          Array.from(
            { length: Math.ceil(SUV_SPEC.carHeight) + 1 },
            (_, i) => Math.floor(feetY) + i,
          ),
        );
      }),
    );
  });

  it("counts the surface cell as full", () => {
    expect(depthFromCells(10.75, (y) => y === 10)).toBe(0.25);
  });
});

function depthFromCells(
  feetY: number,
  isWater: (y: number) => boolean,
  maxHeight: number = SUV_SPEC.carHeight,
): number {
  return waterDepthAt(
    { x: 0, y: feetY, z: 0 },
    (o) => isWater(Math.floor(feetY + o.y)),
    maxHeight,
  );
}

function referenceDepth(
  feetY: number,
  isWater: (cellY: number) => boolean,
): number {
  let bottom = Math.floor(feetY);
  let cells = 0;
  if (isWater(bottom)) cells = 1;
  // Feet resting on a partial block that cannot be waterlogged (mud and soul
  // sand top out at 0.875, dirt path and farmland at 0.9375) sit inside that
  // block's cell, so the water starts in the cell above it.
  else if (feetY > bottom) bottom += 1;
  else return 0;
  const maxCells = Math.ceil(SUV_SPEC.carHeight) + 1;
  while (cells < maxCells && isWater(bottom + cells)) cells++;
  if (cells === 0) return 0;
  return Math.min(bottom + cells - feetY, SUV_SPEC.carHeight + 1);
}

it("matches the previous depth algorithm, including feet within 1e-9 of a cell boundary", () => {
  const nearInteger = fc
    .tuple(
      fc.integer({ min: -256, max: 256 }),
      fc.constantFrom(
        -1e-9,
        -1e-12,
        -Number.EPSILON,
        0,
        Number.EPSILON,
        1e-12,
        1e-9,
      ),
    )
    .map(([y, delta]) => y + delta);
  fc.assert(
    fc.property(
      fc.oneof(feet, nearInteger),
      fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
      (y, column) => {
        const isWater = (cell: number) => column[cell - Math.floor(y)] ?? false;
        expect(depthFromCells(y, isWater)).toBe(referenceDepth(y, isWater));
      },
    ),
  );
});

it("uses the requested maximum height for both the depth and probe cap", () => {
  fc.assert(
    fc.property(
      feet,
      fc.double({ min: 0.1, max: 10, noNaN: true }),
      (y, height) => {
        let probes = 0;
        const depth = depthFromCells(
          y,
          () => {
            probes++;
            return true;
          },
          height,
        );
        expect(probes).toBe(Math.ceil(height) + 1);
        expect(depth).toBe(Math.min(Math.floor(y) + probes - y, height + 1));
      },
    ),
  );
});

it("stops at a false cell above the feet", () => {
  expect(depthFromCells(64.25, (y) => y === 64)).toBe(0.75);
});

it("waterBelowAt queries exactly the cell 0.3 below the feet", () => {
  fc.assert(
    fc.property(feet, fc.boolean(), (y, wet) => {
      const checked: number[] = [];
      expect(
        waterBelowAt((o) => {
          expect(o).toEqual({ x: 0, y: -0.3, z: 0 });
          checked.push(Math.floor(y + o.y));
          return wet;
        }),
      ).toBe(wet);
      expect(checked).toEqual([Math.floor(y - 0.3)]);
    }),
  );
});

it("reports water below feet less than 0.3 above a water cell, independently of waterDepth", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -60, max: 300 }),
      // Exactly 0.3 is left out: y + 0.3 - 0.3 rounds below y for some y.
      fc
        .oneof(
          fc.double({ min: 0, max: 0.999, noNaN: true }),
          fc.constantFrom(0, 0.299, 0.301, 0.999),
        )
        .filter((fraction) => Math.abs(fraction - 0.3) > 1e-9),
      (y, fraction) => {
        const feetY = y + fraction;
        const waterAt = (o: { y: number }) => Math.floor(feetY + o.y) === y - 1;
        expect(
          waterDepthAt({ x: 0, y: feetY, z: 0 }, waterAt, SUV_SPEC.carHeight),
        ).toBe(0);
        // Feet 0.3 or more above the water cell are airborne, not afloat.
        expect(waterBelowAt(waterAt)).toBe(fraction < 0.3);
      },
    ),
  );
});
