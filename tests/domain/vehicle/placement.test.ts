import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../src/domain/shared/vec";
import {
  type BlockFace,
  canPlaceAt,
  FACE_OFFSET,
  placementCell,
  surfaceCellY,
} from "../../../src/domain/vehicle/placement";
import {
  SPORTSBOAT_PROFILE,
  SUV_PROFILE,
} from "../../../src/domain/vehicle/profile";

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
    expect(canPlaceAt(() => true, SUV_PROFILE.placement.clearance)).toBe(true);
  });

  it("cannot place when any single cell of the 3 × 2 × 3 footprint is blocked", () => {
    fc.assert(
      fc.property(insideFootprint, (b) => {
        expect(
          canPlaceAt(onlyBlocked(b), SUV_PROFILE.placement.clearance),
        ).toBe(false);
      }),
    );
  });

  it("can place when the only blocked cell is outside the footprint", () => {
    fc.assert(
      fc.property(outsideFootprint, (b) => {
        expect(
          canPlaceAt(onlyBlocked(b), SUV_PROFILE.placement.clearance),
        ).toBe(true);
      }),
    );
  });
});

describe("clearance query order (ADR 0055)", () => {
  const legacyCells = [-1, 0, 1].flatMap((dx) =>
    [-1, 0, 1].flatMap((dz) => [1, 2].map((dy) => [dx, dy, dz])),
  );

  it("visits exactly the original eighteen cells, stopping at the first obstruction", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 18, maxLength: 18 }),
        (air) => {
          for (const profile of [SUV_PROFILE, SPORTSBOAT_PROFILE]) {
            for (const layout of [air, Array<boolean>(18).fill(true)]) {
              const queries: number[][] = [];
              const result = canPlaceAt((dx, dy, dz) => {
                queries.push([dx, dy, dz]);
                return layout[queries.length - 1] ?? false;
              }, profile.placement.clearance);
              const blocked = layout.indexOf(false);
              expect(result).toBe(blocked === -1);
              expect(queries).toEqual(
                legacyCells.slice(0, blocked === -1 ? 18 : blocked + 1),
              );
            }
          }
        },
      ),
    );
  });

  it("uses every dimension of a kind's clearance", () => {
    fc.assert(
      fc.property(
        fc.record({
          halfX: fc.integer({ min: 0, max: 4 }),
          halfZ: fc.integer({ min: 0, max: 4 }),
          height: fc.integer({ min: 1, max: 5 }),
        }),
        (clearance) => {
          const queries: number[][] = [];
          expect(
            canPlaceAt((dx, dy, dz) => {
              queries.push([dx, dy, dz]);
              return true;
            }, clearance),
          ).toBe(true);
          const range = (from: number, to: number) =>
            Array.from({ length: to - from + 1 }, (_, i) => from + i);
          const expected = range(-clearance.halfX, clearance.halfX).flatMap(
            (dx) =>
              range(-clearance.halfZ, clearance.halfZ).flatMap((dz) =>
                range(1, clearance.height).map((dy) => [dx, dy, dz]),
              ),
          );
          expect(queries).toEqual(expected);
        },
      ),
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

const FACES: BlockFace[] = ["up", "down", "north", "south", "east", "west"];
const key = ({ x, y, z }: Vec3) => `${x},${y},${z}`;
const add = (a: Vec3, b: Vec3) => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
const cell = fc.record({
  x: fc.integer({ min: -100, max: 100 }),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.integer({ min: -100, max: 100 }),
});
// Water cells scattered within two blocks of the clicked one.
const near = fc.uniqueArray(
  fc.record({
    x: fc.integer({ min: -2, max: 2 }),
    y: fc.integer({ min: -2, max: 2 }),
    z: fc.integer({ min: -2, max: 2 }),
  }),
  { maxLength: 60, selector: key },
);
const waterOf = (clicked: Vec3, offsets: Vec3[]) => {
  const cells = new Set(offsets.map((o) => key(add(clicked, o))));
  return (at: Vec3) => cells.has(key(at));
};

describe("placementCell (ADR 0050, ADR 0051)", () => {
  it("preserves legacy results and water queries for both kinds on every face", () => {
    fc.assert(
      fc.property(
        cell,
        fc.array(fc.boolean(), { minLength: 43, maxLength: 43 }),
        fc.array(fc.boolean(), { minLength: 43, maxLength: 43 }),
        fc.option(fc.integer({ min: 0, max: 40 }), { nil: undefined }),
        (clicked, clickedColumn, adjacentColumn, maxClimb) => {
          for (const face of FACES) {
            const next = add(clicked, FACE_OFFSET[face]);
            const columnAt = (at: Vec3): boolean[] => {
              if (at.x === clicked.x && at.z === clicked.z)
                return clickedColumn;
              if (at.x === next.x && at.z === next.z) return adjacentColumn;
              return [];
            };
            const isWater = (at: Vec3) =>
              columnAt(at)[at.y - clicked.y + 1] ?? false;
            for (const [profile, legacyRule] of [
              [SUV_PROFILE, { onWater: false, anyFace: false }],
              [SPORTSBOAT_PROFILE, { onWater: true, anyFace: true }],
            ] as const) {
              const queries: Vec3[] = [];
              const legacyQueries: Vec3[] = [];
              const actual = placementCell(
                profile.placement,
                clicked,
                face,
                (at) => {
                  queries.push(at);
                  return isWater(at);
                },
                maxClimb,
              );
              const expected = legacyPlacementCell(
                legacyRule,
                clicked,
                face,
                (at) => {
                  legacyQueries.push(at);
                  return isWater(at);
                },
                maxClimb,
              );
              expect(actual).toEqual(expected);
              expect(queries).toEqual(legacyQueries);
            }
          }
        },
      ),
    );
  });

  it("tries surfaces in their declared order and has no implicit top fallback", () => {
    fc.assert(
      fc.property(cell, (clicked) => {
        const clearance = SUV_PROFILE.placement.clearance;
        expect(
          placementCell(
            { surfaces: ["top", "water"], clearance },
            clicked,
            "up",
            () => true,
          ),
        ).toEqual(clicked);
        expect(
          placementCell(
            { surfaces: ["water", "top"], clearance },
            clicked,
            "up",
            () => true,
          ),
        ).toEqual({ ...clicked, y: clicked.y + 16 });
        expect(
          placementCell(
            { surfaces: ["water"], clearance },
            clicked,
            "up",
            () => false,
          ),
        ).toBeUndefined();
        expect(
          placementCell({ surfaces: [], clearance }, clicked, "up", () => true),
        ).toBeUndefined();
      }),
    );
  });

  it("places a land kind only on the top face of the clicked block, ignoring water", () => {
    fc.assert(
      fc.property(
        cell,
        fc.constantFrom(...FACES),
        near,
        (clicked, face, offsets) => {
          expect(
            placementCell(
              SUV_PROFILE.placement,
              clicked,
              face,
              waterOf(clicked, offsets),
            ),
          ).toEqual(face === "up" ? clicked : undefined);
        },
      ),
    );
  });

  it("places a water kind at the top of the water in the clicked cell or next to the clicked face, else only on a top face", () => {
    fc.assert(
      fc.property(
        cell,
        fc.constantFrom(...FACES),
        near,
        (clicked, face, offsets) => {
          const isWater = waterOf(clicked, offsets);
          const next = add(clicked, FACE_OFFSET[face]);
          const wet = [clicked, next].find(isWater);
          const result = placementCell(
            SPORTSBOAT_PROFILE.placement,
            clicked,
            face,
            isWater,
          );
          if (wet === undefined) {
            expect(result).toEqual(face === "up" ? clicked : undefined);
            return;
          }
          expect(result).toBeDefined();
          if (!result) return;
          expect({ x: result.x, z: result.z }).toEqual({ x: wet.x, z: wet.z });
          expect(result.y).toBeGreaterThanOrEqual(wet.y);
          for (let y = wet.y; y <= result.y; y++)
            expect(isWater({ ...wet, y })).toBe(true);
          expect(isWater({ ...wet, y: result.y + 1 })).toBe(false);
        },
      ),
    );
  });

  it("puts a boat clicked on the side of a shore on the water beside it, and nowhere when the side faces air", () => {
    // Shore block at (0, 62, 0); water fills x >= 1 from the bed at y 59 up to y 62.
    const isWater = ({ x, y }: Vec3) => x >= 1 && y >= 60 && y <= 62;
    const shore = { x: 0, y: 62, z: 0 };
    const rule = SPORTSBOAT_PROFILE.placement;
    expect(placementCell(rule, shore, "east", isWater)).toEqual({
      x: 1,
      y: 62,
      z: 0,
    });
    expect(placementCell(rule, { x: 0, y: 60, z: 0 }, "east", isWater)).toEqual(
      { x: 1, y: 62, z: 0 },
    );
    expect(placementCell(rule, shore, "west", isWater)).toBeUndefined();
    expect(
      placementCell(rule, { x: 0, y: 63, z: 0 }, "east", isWater),
    ).toBeUndefined();
    expect(placementCell(rule, shore, "up", isWater)).toEqual(shore);
    expect(placementCell(rule, { x: 3, y: 59, z: 0 }, "up", isWater)).toEqual({
      x: 3,
      y: 62,
      z: 0,
    });
  });
});

// Pre-refactor placement logic is the behavior oracle for ADR 0055.
function legacyPlacementCell(
  rule: { onWater: boolean; anyFace: boolean },
  clicked: Vec3,
  face: BlockFace,
  isWaterAt: (at: Vec3) => boolean,
  maxClimb = 16,
): Vec3 | undefined {
  if (!rule.anyFace && face !== "up") return undefined;
  if (rule.onWater) {
    const offset = FACE_OFFSET[face];
    const next = {
      x: clicked.x + offset.x,
      y: clicked.y + offset.y,
      z: clicked.z + offset.z,
    };
    for (const cell of [clicked, next]) {
      if (!isWaterAt(cell)) continue;
      const { x, z } = cell;
      return {
        x,
        y: surfaceCellY(cell.y, (y) => isWaterAt({ x, y, z }), maxClimb),
        z,
      };
    }
  }
  return face === "up" ? clicked : undefined;
}
