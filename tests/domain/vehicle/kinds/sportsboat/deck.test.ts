import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward, leftOf } from "../../../../../src/domain/shared/vec";
import type {
  FloorCell,
  HoldPose,
} from "../../../../../src/domain/vehicle/floor";
import {
  DECK,
  type DeckPart,
  DOCK,
  floorCells,
  holdHeight,
} from "../../../../../src/domain/vehicle/kinds/sportsboat/deck";

const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const pose = fc.record<HoldPose>({
  x: number(-1000, 1000),
  y: number(-60, 300),
  z: number(-1000, 1000),
  yaw: fc.double({ min: -180, max: 180, maxExcluded: true, noNaN: true }),
});

// Bounds each grown part by its width plus its length, which is never less than
// its corner distance, so the comparison reaches past any cell the scan skips.
const WINDOW =
  Math.ceil(
    Math.max(
      ...DECK.parts.map(
        (part) =>
          part.halfWidth +
          Math.max(Math.abs(part.zMin), Math.abs(part.zMax)) +
          2 * DECK.margin,
      ),
    ),
  ) + 1;

function coveringParts(
  p: HoldPose,
  cell: Pick<FloorCell, "x" | "z">,
): DeckPart[] {
  const f = forward(p.yaw);
  const left = leftOf(f);
  const dx = cell.x + 0.5 - p.x;
  const dz = cell.z + 0.5 - p.z;
  const x = dx * left.x + dz * left.z;
  const z = dx * f.x + dz * f.z;
  return DECK.parts.filter(
    (part) =>
      Math.abs(x) <= part.halfWidth + DECK.margin &&
      z >= part.zMin - DECK.margin &&
      z <= part.zMax + DECK.margin,
  );
}

describe("sports boat deck floor (ADR 0063)", () => {
  it("uses the docking thresholds and model measurements recorded in the ADR", () => {
    expect(DOCK).toStrictEqual({
      maxSpeed: 0.005,
      ticks: 20,
      draft: 0.45,
      stick: 0.1,
    });
    expect(DECK.margin).toBe(0.3);
    expect(DECK.parts).toStrictEqual([
      { halfWidth: 0.96, zMin: -2.75, zMax: 0.875, height: 9.3 / 16 },
      { halfWidth: 0.22, zMin: 0.875, zMax: 1.125, height: 11.3 / 16 },
      { halfWidth: 0.69, zMin: 1.125, zMax: 2.5, height: 11.3 / 16 },
    ]);
    expect(Object.isFrozen(DOCK)).toBe(true);
    expect(Object.isFrozen(DECK)).toBe(true);
    expect(Object.isFrozen(DECK.parts)).toBe(true);
  });

  it("covers exactly the cell centers within a deck part grown by the margin", () => {
    fc.assert(
      fc.property(pose, (p) => {
        const cells = floorCells(p);
        const covered = new Set(cells.map((cell) => `${cell.x},${cell.z}`));
        expect(cells.length).toBeGreaterThan(0);
        for (const cell of cells) {
          expect(coveringParts(p, cell).length).toBeGreaterThan(0);
        }
        for (
          let x = Math.floor(p.x) - WINDOW;
          x <= Math.floor(p.x) + WINDOW;
          x++
        ) {
          for (
            let z = Math.floor(p.z) - WINDOW;
            z <= Math.floor(p.z) + WINDOW;
            z++
          ) {
            expect(covered.has(`${x},${z}`)).toBe(
              coveringParts(p, { x, z }).length > 0,
            );
          }
        }
      }),
    );
  });

  it("rounds the highest covering surface to a collision height of 1 to 16 pixels", () => {
    fc.assert(
      fc.property(pose, (p) => {
        for (const cell of floorCells(p)) {
          const top = Math.max(
            ...coveringParts(p, cell).map((part) => p.y + part.height),
          );
          expect(Number.isInteger(cell.height)).toBe(true);
          expect(cell.height).toBeGreaterThanOrEqual(1);
          expect(cell.height).toBeLessThanOrEqual(16);
          expect(cell.y).toBe(Math.floor(top));
          if (Math.round((top - cell.y) * 16) === 0) {
            expect(cell.height).toBe(1);
          } else {
            expect(
              Math.abs(cell.y + cell.height / 16 - top),
            ).toBeLessThanOrEqual(1 / 32);
          }
        }
      }),
    );
  });

  it("returns unique cells sorted by x and then z", () => {
    fc.assert(
      fc.property(pose, (p) => {
        const cells = floorCells(p);
        expect(new Set(cells.map((cell) => `${cell.x},${cell.z}`)).size).toBe(
          cells.length,
        );
        expect(cells).toStrictEqual(
          [...cells].sort((a, b) => a.x - b.x || a.z - b.z),
        );
      }),
    );
  });

  it("returns the same cells after rotating by a full turn", () => {
    fc.assert(
      fc.property(pose, (p) => {
        expect(floorCells({ ...p, yaw: p.yaw + 360 })).toStrictEqual(
          floorCells(p),
        );
      }),
    );
  });

  it("shifts the cells by the same whole blocks as the hold pose", () => {
    const shift = fc.record({
      x: fc.integer({ min: -100, max: 100 }),
      y: fc.integer({ min: -100, max: 100 }),
      z: fc.integer({ min: -100, max: 100 }),
    });
    fc.assert(
      fc.property(pose, shift, (p, d) => {
        expect(
          floorCells({ ...p, x: p.x + d.x, y: p.y + d.y, z: p.z + d.z }),
        ).toStrictEqual(
          floorCells(p).map((cell) => ({
            ...cell,
            x: cell.x + d.x,
            y: cell.y + d.y,
            z: cell.z + d.z,
          })),
        );
      }),
    );
  });

  it("matches the spike's cockpit and bow heights above the water", () => {
    const cells = floorCells({ x: 267.5, y: -60.45, z: 15.5, yaw: 0 });
    expect(cells.length).toBeGreaterThanOrEqual(13);
    expect(new Set(cells.map((cell) => cell.y))).toStrictEqual(new Set([-60]));
    const heightAt = (z: number) =>
      cells.find((cell) => cell.x === 267 && cell.z === z)?.height;
    expect(heightAt(15)).toBe(2);
    expect(heightAt(17)).toBe(4);
    // The grown cockpit and bow overlap at z = 16; the higher bow wins.
    expect(heightAt(16)).toBe(4);
    expect(new Set(cells.map((cell) => cell.height))).toStrictEqual(
      new Set([2, 4]),
    );
  });

  it("clamps an exact block top to one pixel and rounds a top just below the next block to sixteen", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -60, max: 299 }),
        fc.constantFrom(0, 0.999),
        (y, fraction) => {
          const cells = floorCells({
            x: 0.5,
            y: y + fraction - 9.3 / 16,
            z: 0.5,
            yaw: 0,
          });
          expect(
            cells.find((cell) => cell.x === 0 && cell.z === 0),
          ).toStrictEqual({
            x: 0,
            y,
            z: 0,
            height: fraction === 0 ? 1 : 16,
          });
        },
      ),
    );
  });
});

describe("holdHeight (ADR 0063)", () => {
  it("takes the topmost water cell and stops querying after finding it", () => {
    fc.assert(
      fc.property(
        number(-60, 300),
        fc.tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean()),
        (feetY, water) => {
          const offsets = [2, 1, 0, -1];
          const queried: number[] = [];
          const first = water.indexOf(true);
          const height = holdHeight(feetY, (dy) => {
            queried.push(dy);
            return water[offsets.indexOf(dy)] ?? false;
          });
          expect(queried).toStrictEqual(
            first === -1 ? offsets : offsets.slice(0, first + 1),
          );
          expect(height).toBe(
            first === -1
              ? undefined
              : Math.floor(feetY + (offsets[first] as number)) + 1 - DOCK.draft,
          );
        },
      ),
    );
  });

  it("uses water at the feet, prefers water above them, and returns undefined for a dry column", () => {
    const feetY = -60.45;
    expect(holdHeight(feetY, (dy) => dy === 0)).toBe(
      Math.floor(feetY) + 1 - 0.45,
    );
    expect(holdHeight(feetY, (dy) => dy === 1 || dy === 0)).toBe(
      Math.floor(feetY + 1) + 1 - 0.45,
    );
    expect(holdHeight(feetY, () => false)).toBeUndefined();
  });
});
