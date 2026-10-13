import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DECK_SEAT_REACH } from "../../../src/domain/vehicle/kinds/index";
import { farthestSeatReach } from "../../../src/domain/vehicle/seats";

const position = fc.record({
  x: fc.double({ min: -5, max: 5, noNaN: true }),
  z: fc.double({ min: -5, max: 5, noNaN: true }),
});
const layout = fc.record({ positions: fc.array(position) });

describe("farthestSeatReach", () => {
  it("bounds every seat's distance from its vehicle across all layouts", () => {
    fc.assert(
      fc.property(fc.array(layout), (layouts) => {
        const reach = farthestSeatReach(layouts);
        for (const { positions } of layouts) {
          for (const { x, z } of positions) {
            expect(Math.hypot(x, z)).toBeLessThanOrEqual(reach);
          }
        }
      }),
    );
  });

  it("equals the distance of at least one seat when seats are present", () => {
    fc.assert(
      fc.property(
        fc
          .array(layout)
          .filter((layouts) =>
            layouts.some(({ positions }) => positions.length > 0),
          ),
        (layouts) => {
          const reach = farthestSeatReach(layouts);
          expect(
            layouts.some(({ positions }) =>
              positions.some(({ x, z }) => Math.hypot(x, z) === reach),
            ),
          ).toBe(true);
        },
      ),
    );
  });

  it("returns zero when there are no seats", () => {
    expect(farthestSeatReach([])).toBe(0);
    expect(farthestSeatReach([{ positions: [] }])).toBe(0);
  });
});

it("computes DECK_SEAT_REACH from the current kinds' seat layouts", () => {
  expect(DECK_SEAT_REACH).toBeCloseTo(Math.hypot(0.38, 0.8));
});
