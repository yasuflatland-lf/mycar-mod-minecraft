import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { refloor } from "../../../src/domain/vehicle/floor";
import { cellKey } from "../../../src/domain/vehicle/headlights";

const cell = fc.record({
  x: fc.integer({ min: -3, max: 3 }),
  y: fc.integer({ min: -3, max: 3 }),
  z: fc.integer({ min: -3, max: 3 }),
  height: fc.integer({ min: 1, max: 16 }),
});
const cells = fc.uniqueArray(cell, { selector: cellKey });

describe("refloor (ADR 0063)", () => {
  it("clears only unwanted cells and places exactly new or resized cells", () => {
    fc.assert(
      fc.property(cells, cells, (laid, wanted) => {
        const { clear, place } = refloor(laid, wanted);
        expect(clear).toEqual(
          laid.filter((c) => !wanted.some((w) => cellKey(w) === cellKey(c))),
        );
        expect(place).toEqual(
          wanted.filter(
            (c) =>
              !laid.some(
                (l) => cellKey(l) === cellKey(c) && l.height === c.height,
              ),
          ),
        );
        const after = new Map(laid.map((c) => [cellKey(c), c.height]));
        for (const c of clear) after.delete(cellKey(c));
        for (const c of place) after.set(cellKey(c), c.height);
        expect(after).toEqual(
          new Map(wanted.map((c) => [cellKey(c), c.height])),
        );
      }),
    );
  });

  it("does no work for an unchanged floor, regardless of cell order", () => {
    fc.assert(
      fc.property(cells, (laid) => {
        expect(refloor(laid, [...laid].reverse())).toEqual({
          clear: [],
          place: [],
        });
      }),
    );
  });

  it("resizes every changed height without clearing its cell", () => {
    fc.assert(
      fc.property(cells, (laid) => {
        const wanted = laid.map((c) => ({ ...c, height: (c.height % 16) + 1 }));
        expect(refloor(laid, wanted)).toEqual({ clear: [], place: wanted });
      }),
    );
  });
});
