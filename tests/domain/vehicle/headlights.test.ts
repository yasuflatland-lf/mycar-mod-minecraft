import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dot, forward, rightOf } from "../../../src/domain/shared/vec";
import {
  type Cell,
  cellKey,
  headlightCells,
  relight,
} from "../../../src/domain/vehicle/headlights";
import { SPEC } from "../../../src/domain/vehicle/spec";

const coord = fc.double({ min: -1e5, max: 1e5, noNaN: true });
const location = fc.record({
  x: coord,
  y: fc.double({ min: -64, max: 300, noNaN: true }),
  z: coord,
});
const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const cell = fc.record({
  x: fc.integer({ min: -3, max: 3 }),
  y: fc.integer({ min: -3, max: 3 }),
  z: fc.integer({ min: -3, max: 3 }),
});
const cells = fc.uniqueArray(cell, { selector: cellKey });
const keys = (cs: readonly Cell[]) => new Set(cs.map(cellKey));

describe("headlightCells (ADR 0020)", () => {
  it("lights one block above the ground, ahead of the vehicle and in front of its body, within the reach", () => {
    fc.assert(
      fc.property(location, yaw, (at, y) => {
        const f = forward(y);
        const out = headlightCells(at, y);
        expect(out.length).toBeGreaterThan(0);
        expect(out.length).toBeLessThanOrEqual(SPEC.headlightReach.length);
        for (const c of out) {
          expect(c.y).toBe(Math.floor(at.y) + 1);
          // The cell's center, measured along and across the heading
          const d = { x: c.x + 0.5 - at.x, z: c.z + 0.5 - at.z };
          const ahead = dot(d, f);
          expect(ahead).toBeGreaterThan(SPEC.bodyFront);
          expect(ahead).toBeLessThan(Math.max(...SPEC.headlightReach) + 1);
          expect(Math.abs(dot(d, rightOf(f)))).toBeLessThan(1);
        }
      }),
    );
  });

  it("returns integer cells without duplicates", () => {
    fc.assert(
      fc.property(location, yaw, (at, y) => {
        const out = headlightCells(at, y);
        for (const c of out)
          expect([c.x, c.y, c.z].every(Number.isInteger)).toBe(true);
        expect(keys(out).size).toBe(out.length);
      }),
    );
  });
});

describe("relight (ADR 0020)", () => {
  it("clears exactly the lit cells no longer wanted and lights exactly the wanted cells not lit yet", () => {
    fc.assert(
      fc.property(cells, cells, (lit, wanted) => {
        const { clear, light } = relight(lit, wanted);
        const after = new Set([
          ...[...keys(lit)].filter((k) => !keys(clear).has(k)),
          ...keys(light),
        ]);
        expect(after).toEqual(keys(wanted));
        for (const c of clear) expect(keys(lit).has(cellKey(c))).toBe(true);
        for (const c of light) expect(keys(lit).has(cellKey(c))).toBe(false);
      }),
    );
  });

  it("changes nothing when the wanted cells are already lit", () => {
    fc.assert(
      fc.property(cells, (lit) => {
        expect(relight(lit, lit)).toEqual({ clear: [], light: [] });
      }),
    );
  });
});
