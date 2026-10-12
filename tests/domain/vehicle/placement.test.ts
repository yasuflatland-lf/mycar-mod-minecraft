import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { Vec3 } from "../../../src/domain/shared/vec";
import { SPORTSBOAT_PROFILE } from "../../../src/domain/vehicle/kinds/sportsboat/profile";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import {
  type BlockFace,
  canPlaceAt,
  FACE_OFFSET,
  placementCell,
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

describe("clearance queries (ADR 0055)", () => {
  it("checks only distinct clearance cells and stops at the first obstruction", () => {
    const clearance = fc.record({
      halfX: fc.integer({ min: 0, max: 4 }),
      halfZ: fc.integer({ min: 0, max: 4 }),
      height: fc.integer({ min: 1, max: 5 }),
    });
    fc.assert(
      fc.property(
        clearance.chain((box) => {
          const size = (2 * box.halfX + 1) * (2 * box.halfZ + 1) * box.height;
          return fc.tuple(
            fc.constant(box),
            fc.array(fc.boolean(), { minLength: size, maxLength: size }),
          );
        }),
        ([box, air]) => {
          for (const layout of [air, air.map(() => true)]) {
            const queries: string[] = [];
            const answers: boolean[] = [];
            const result = canPlaceAt((dx, dy, dz) => {
              expect(Math.abs(dx)).toBeLessThanOrEqual(box.halfX);
              expect(Math.abs(dz)).toBeLessThanOrEqual(box.halfZ);
              expect(dy).toBeGreaterThanOrEqual(1);
              expect(dy).toBeLessThanOrEqual(box.height);
              expect([dx, dy, dz].every(Number.isInteger)).toBe(true);
              queries.push(`${dx},${dy},${dz}`);
              const index =
                ((dx + box.halfX) * (2 * box.halfZ + 1) + dz + box.halfZ) *
                  box.height +
                dy -
                1;
              const clear = layout[index] ?? false;
              answers.push(clear);
              return clear;
            }, box);
            expect(result).toBe(layout.every(Boolean));
            expect(new Set(queries).size).toBe(queries.length);
            expect(answers.slice(0, -1).every(Boolean)).toBe(true);
            if (result) expect(queries).toHaveLength(layout.length);
            else expect(answers.at(-1)).toBe(false);
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
  it("bounds water placement by the contiguous column and the requested or default climb", () => {
    const column = fc.oneof(
      fc.array(fc.boolean(), { minLength: 43, maxLength: 43 }),
      fc
        .integer({ min: 0, max: 43 })
        .map((length) => Array.from({ length: 43 }, (_, i) => i < length)),
    );
    fc.assert(
      fc.property(
        cell,
        column,
        fc.integer({ min: 0, max: 40 }),
        (clicked, above, limit) => {
          const gap = above.indexOf(false);
          const height = gap === -1 ? above.length : gap;
          for (const face of FACES) {
            for (const wet of [clicked, add(clicked, FACE_OFFSET[face])]) {
              const isWater = (at: Vec3) =>
                at.x === wet.x &&
                at.z === wet.z &&
                (at.y === wet.y || (above[at.y - wet.y - 1] ?? false));
              // An adjacent upward column can also contain the clicked cell on a down click.
              if (key(wet) !== key(clicked) && isWater(clicked)) continue;
              for (const maxClimb of [limit, undefined]) {
                expect(
                  placementCell(
                    SPORTSBOAT_PROFILE.placement,
                    clicked,
                    face,
                    isWater,
                    maxClimb,
                  ),
                ).toEqual({
                  ...wet,
                  y: wet.y + Math.min(height, maxClimb ?? 16),
                });
              }
            }
          }
        },
      ),
    );
  });

  it("prefers the clicked water cell when the adjacent cell is also wet", () => {
    fc.assert(
      fc.property(
        cell,
        fc.integer({ min: 0, max: 40 }),
        (clicked, maxClimb) => {
          for (const face of FACES) {
            expect(
              placementCell(
                SPORTSBOAT_PROFILE.placement,
                clicked,
                face,
                () => true,
                maxClimb,
              ),
            ).toEqual({ ...clicked, y: clicked.y + maxClimb });
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
          const waterAt = vi.fn(waterOf(clicked, offsets));
          expect(
            placementCell(SUV_PROFILE.placement, clicked, face, waterAt),
          ).toEqual(face === "up" ? clicked : undefined);
          expect(waterAt).not.toHaveBeenCalled();
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
