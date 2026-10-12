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

type Unavailable = "throw" | "undefined" | undefined;

const nextHeight = (c: FloorCell): FloorCell => ({
  ...c,
  height: (c.height % 16) + 1,
});

// Each dimension has its own blocks, so a test can tell which one was changed.
function fakeDimension(id: string) {
  const blocks = new Map<string, { typeId: string; height?: number }>();
  let unavailable: Unavailable;
  const at = (c: FloorCell) =>
    blocks.get(cellKey(c)) ?? { typeId: "minecraft:air" };
  const dimension = {
    id,
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
  return {
    dimension,
    at,
    blocks,
    unavailable: (mode: Unavailable) => {
      unavailable = mode;
    },
  };
}

function fixture() {
  const overworld = fakeDimension("overworld");
  const saved = new Map<string, unknown>();
  const car = {
    id: "car",
    isValid: true,
    dimension: overworld.dimension,
    getDynamicProperty: (key: string) => saved.get(key),
    setDynamicProperty: (key: string, value: unknown) => saved.set(key, value),
  } as unknown as Entity;
  return {
    car,
    at: overworld.at,
    blocks: overworld.blocks,
    saved,
    savedCells: () => JSON.parse(String(saved.get(DECK_CELLS_PROPERTY))),
    unavailable: overworld.unavailable,
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
        expect(f.savedCells()).toEqual(wanted);
        const resized = wanted.map(nextHeight);
        const reloaded = new FloorBlocks();
        reloaded.lay(f.car.id, f.car, resized);
        for (const c of resized)
          expect(f.at(c)).toEqual({
            typeId: DECK_FLOOR_BLOCK,
            height: c.height,
          });
        expect(f.savedCells()).toEqual(resized);
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
        expect(f.savedCells()).toEqual(allowed);
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
        const resized = wanted.map(nextHeight);
        f.unavailable("throw");
        floors.lay(f.car.id, f.car, resized);
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBe(before);
        f.unavailable(undefined);
        floors.lay(f.car.id, f.car, resized);
        expect(f.savedCells()).toEqual(resized);
      }),
    );
  });

  it("clears the old dimension, not the new one, when the vehicle changes dimension", () => {
    fc.assert(
      fc.property(cells, cells, (wanted, there) => {
        const f = fixture();
        const nether = fakeDimension("nether");
        const floors = new FloorBlocks();
        floors.lay(f.car.id, f.car, wanted);
        for (const c of wanted)
          nether.blocks.set(cellKey(c), { typeId: DECK_FLOOR_BLOCK });
        Object.assign(f.car, { dimension: nether.dimension });
        floors.lay(f.car.id, f.car, []);
        for (const c of wanted) {
          expect(f.at(c).typeId).toBe("minecraft:air");
          expect(nether.at(c).typeId).toBe(DECK_FLOOR_BLOCK);
        }
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
        // The blocks above belonged to someone else; start from open air.
        nether.blocks.clear();
        floors.lay(f.car.id, f.car, there);
        for (const c of there)
          expect(nether.at(c)).toEqual({
            typeId: DECK_FLOOR_BLOCK,
            height: c.height,
          });
        expect(f.savedCells()).toEqual(there);
      }),
    );
  });

  it("keeps the cells it could not clear in the old dimension and clears them later", () => {
    fc.assert(
      fc.property(
        cells,
        fc.constantFrom<Unavailable>("throw", "undefined"),
        (wanted, mode) => {
          const f = fixture();
          const nether = fakeDimension("nether");
          const floors = new FloorBlocks();
          floors.lay(f.car.id, f.car, wanted);
          f.unavailable(mode);
          Object.assign(f.car, { dimension: nether.dimension });
          floors.lay(f.car.id, f.car, []);
          floors.clearGone(new Set([f.car.id]));
          expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
          f.unavailable(undefined);
          for (const c of wanted) expect(f.at(c).typeId).toBe(DECK_FLOOR_BLOCK);
          floors.clearGone(new Set([f.car.id]));
          for (const c of wanted) expect(f.at(c).typeId).toBe("minecraft:air");
          expect(nether.blocks.size).toBe(0);
        },
      ),
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
