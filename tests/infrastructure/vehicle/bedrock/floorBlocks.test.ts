import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { FloorCell } from "../../../../src/domain/vehicle/floor";
import { cellKey } from "../../../../src/domain/vehicle/headlights";
import { FloorBlocks } from "../../../../src/infrastructure/vehicle/bedrock/floorBlocks";
import {
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  DECK_FLOOR_HEIGHT_STATE,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

vi.mock("@minecraft/server", () => ({
  BlockPermutation: {
    resolve: (typeId: string, states: Record<string, number>) => ({
      typeId,
      states,
    }),
  },
}));

const cell = fc.record({
  x: fc.integer({ min: -3, max: 3 }),
  y: fc.integer({ min: -3, max: 3 }),
  z: fc.integer({ min: -3, max: 3 }),
  height: fc.integer({ min: 1, max: 16 }),
});
const cells = fc.uniqueArray(cell, {
  selector: cellKey,
  minLength: 1,
  maxLength: 8,
});

function fixture() {
  const blocks = new Map<string, { typeId: string; height?: number }>();
  const saved = new Map<string, unknown>();
  let unavailable: "throw" | "undefined" | undefined;
  const at = (c: FloorCell) =>
    blocks.get(cellKey(c)) ?? { typeId: "minecraft:air" };
  const dimension = {
    id: "overworld",
    getBlock: (c: FloorCell) => {
      if (unavailable === "throw") throw new Error("unloaded");
      if (unavailable === "undefined") return undefined;
      return {
        get typeId() {
          return at(c).typeId;
        },
        get isAir() {
          return at(c).typeId === "minecraft:air";
        },
        setType: (typeId: string) => blocks.set(cellKey(c), { typeId }),
        setPermutation: (p: {
          typeId: string;
          states: Record<string, number>;
        }) =>
          blocks.set(cellKey(c), {
            typeId: p.typeId,
            height: p.states[DECK_FLOOR_HEIGHT_STATE],
          }),
      };
    },
  };
  const car = {
    id: "car",
    isValid: true,
    dimension,
    getDynamicProperty: (key: string) => saved.get(key),
    setDynamicProperty: (key: string, value: unknown) => saved.set(key, value),
  } as unknown as Entity;
  return {
    car,
    at,
    blocks,
    saved,
    unavailable: (mode: typeof unavailable) => {
      unavailable = mode;
    },
  };
}

describe("FloorBlocks (ADR 0063)", () => {
  it("persists placed cells, restores them after reload, resizes owned cells and clears them", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const f = fixture();
        const floors = new FloorBlocks();
        floors.lay(f.car.id, f.car, wanted);
        for (const c of wanted)
          expect(f.at(c)).toEqual({
            typeId: DECK_FLOOR_BLOCK,
            height: c.height,
          });
        expect(JSON.parse(String(f.saved.get(DECK_CELLS_PROPERTY)))).toEqual(
          wanted,
        );
        const resized = wanted.map((c) => ({
          ...c,
          height: (c.height % 16) + 1,
        }));
        const reloaded = new FloorBlocks();
        reloaded.lay(f.car.id, f.car, resized);
        for (const c of resized)
          expect(f.at(c)).toEqual({
            typeId: DECK_FLOOR_BLOCK,
            height: c.height,
          });
        expect(JSON.parse(String(f.saved.get(DECK_CELLS_PROPERTY)))).toEqual(
          resized,
        );
        new FloorBlocks().lay(f.car.id, f.car, []);
        for (const c of wanted) expect(f.at(c).typeId).toBe("minecraft:air");
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
      }),
    );
  });

  it("only places in air or light, saves only placed cells and preserves replacement blocks", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const f = fixture();
        const floors = new FloorBlocks();
        wanted.forEach((c, i) => {
          f.blocks.set(cellKey(c), {
            typeId:
              [
                "minecraft:air",
                "minecraft:light_block_15",
                "minecraft:water",
                "minecraft:stone",
                DECK_FLOOR_BLOCK,
              ][i % 5] ?? "minecraft:stone",
          });
        });
        const allowed = wanted.filter((_, i) => i % 5 < 2);
        floors.lay(f.car.id, f.car, wanted);
        expect(JSON.parse(String(f.saved.get(DECK_CELLS_PROPERTY)))).toEqual(
          allowed,
        );
        for (const c of allowed)
          f.blocks.set(cellKey(c), { typeId: "minecraft:stone" });
        floors.lay(f.car.id, f.car, []);
        for (const c of allowed) expect(f.at(c).typeId).toBe("minecraft:stone");
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
      }),
    );
  });

  it("retries unavailable placements and retains unavailable clears for a gone vehicle", () => {
    fc.assert(
      fc.property(
        cells,
        fc.constantFrom("throw", "undefined"),
        (wanted, mode) => {
          const f = fixture();
          const floors = new FloorBlocks();
          f.unavailable(mode);
          floors.lay(f.car.id, f.car, wanted);
          expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
          f.unavailable(undefined);
          floors.lay(f.car.id, f.car, wanted);
          floors.clearGone(new Set([f.car.id]));
          for (const c of wanted) expect(f.at(c).typeId).toBe(DECK_FLOOR_BLOCK);
          f.unavailable(mode);
          floors.lay(f.car.id, undefined, []);
          floors.clearGone(new Set());
          for (const c of wanted) expect(f.at(c).typeId).toBe(DECK_FLOOR_BLOCK);
          f.unavailable(undefined);
          floors.clearGone(new Set());
          for (const c of wanted) expect(f.at(c).typeId).toBe("minecraft:air");
        },
      ),
    );
  });

  it("retains the old saved height until an unavailable resize succeeds", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const f = fixture();
        const floors = new FloorBlocks();
        floors.lay(f.car.id, f.car, wanted);
        const before = f.saved.get(DECK_CELLS_PROPERTY);
        const resized = wanted.map((c) => ({
          ...c,
          height: (c.height % 16) + 1,
        }));
        f.unavailable("throw");
        floors.lay(f.car.id, f.car, resized);
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBe(before);
        f.unavailable(undefined);
        floors.lay(f.car.id, f.car, resized);
        expect(JSON.parse(String(f.saved.get(DECK_CELLS_PROPERTY)))).toEqual(
          resized,
        );
      }),
    );
  });

  it("clears the old dimension and its saved cells when the vehicle changes dimension", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const f = fixture();
        const floors = new FloorBlocks();
        floors.lay(f.car.id, f.car, wanted);
        const moved = {
          ...f.car,
          dimension: { ...f.car.dimension, id: "nether" },
        } as unknown as Entity;
        floors.lay(f.car.id, moved, []);
        for (const c of wanted) expect(f.at(c).typeId).toBe("minecraft:air");
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
      }),
    );
  });

  it.each([
    "{",
    "{}",
    '[{"x":0,"y":0,"z":0,"height":17}]',
    '[{"x":0,"y":0,"z":0,"height":0}]',
    '[{"x":0.5,"y":0,"z":0,"height":1}]',
  ])("ignores malformed saved floor cells: %s", (raw) => {
    const f = fixture();
    f.saved.set(DECK_CELLS_PROPERTY, raw);
    expect(() => new FloorBlocks().lay(f.car.id, f.car, [])).not.toThrow();
    expect(f.blocks.size).toBe(0);
  });
});
