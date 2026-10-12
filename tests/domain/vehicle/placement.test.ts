import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  canPlaceAt,
  surfaceCellY,
} from "../../../src/domain/vehicle/placement";

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

describe("surfaceCellY (ADR 0051)", () => {
  it("returns the top of the contiguous column, bounded by maxClimb", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -64, max: 320 }),
        fc.array(fc.boolean(), { maxLength: 50 }),
        fc.integer({ min: 0, max: 40 }),
        (start, cells, limit) => {
          const dry = cells.indexOf(false);
          const column = dry < 0 ? cells.length : dry;
          const probes: number[] = [];
          const top = surfaceCellY(
            start,
            (y) => {
              probes.push(y);
              return cells[y - start - 1] ?? false;
            },
            limit,
          );
          expect(top).toBe(start + Math.min(column, limit));
          expect(
            probes.every(
              (y) => y > start && y <= start + limit && y <= start + column + 1,
            ),
          ).toBe(true);
        },
      ),
    );
  });

  it("defaults to a climb of at most sixteen cells", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -64, max: 320 }),
        fc.nat({ max: 40 }),
        (start, depth) => {
          expect(surfaceCellY(start, (y) => y <= start + depth)).toBe(
            start + Math.min(depth, 16),
          );
        },
      ),
    );
  });
});
