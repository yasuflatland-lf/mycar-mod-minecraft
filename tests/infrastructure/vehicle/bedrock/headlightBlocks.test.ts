import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cellKey } from "../../../../src/domain/vehicle/headlights";
import { HeadlightBlocks } from "../../../../src/infrastructure/vehicle/bedrock/headlightBlocks";
import {
  LIGHT_BLOCK,
  LIT_CELLS_PROPERTY,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { blockGrid } from "../../../support/blockGrid";
import { defined } from "../../../support/defined";

const cell = fc.record({
  x: fc.integer({ min: -3, max: 3 }),
  y: fc.integer({ min: -3, max: 3 }),
  z: fc.integer({ min: -3, max: 3 }),
});
const cells = fc.uniqueArray(cell, {
  selector: cellKey,
  minLength: 1,
  maxLength: 4,
});

function vehicleIn(grid: ReturnType<typeof blockGrid>): Entity {
  const saved = new Map<string, unknown>();
  return {
    id: "car",
    isValid: true,
    dimension: { id: "overworld", getBlock: grid.getBlock },
    getDynamicProperty: (key: string) => saved.get(key),
    setDynamicProperty: (key: string, value: unknown) => saved.set(key, value),
  } as unknown as Entity;
}

describe("HeadlightBlocks (ADR 0020)", () => {
  it("lights the wanted air cells and turns them back into air when the headlights go off", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const grid = blockGrid();
        const car = vehicleIn(grid);
        const lights = new HeadlightBlocks();
        lights.shine(car.id, car, wanted);
        expect(wanted.map(grid.typeAt)).toEqual(
          wanted.map(() => "minecraft:light_block_15"),
        );
        lights.shine(car.id, car, []);
        expect(wanted.map(grid.typeAt)).toEqual(
          wanted.map(() => "minecraft:air"),
        );
      }),
    );
  });

  it("leaves a block the player placed in the beam when the light moves away, and lights its cell again once it is mined (ADR 0020)", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const grid = blockGrid();
        const car = vehicleIn(grid);
        const lights = new HeadlightBlocks();
        lights.shine(car.id, car, wanted);
        const [first, ...others] = wanted;
        const placed = defined(first, "first wanted cell");
        grid.getBlock(placed).setType("minecraft:stone");
        lights.shine(car.id, car, []);
        expect(grid.typeAt(placed)).toBe("minecraft:stone");
        expect(others.map(grid.typeAt)).toEqual(
          others.map(() => "minecraft:air"),
        );
        expect(car.getDynamicProperty(LIT_CELLS_PROPERTY)).toBeUndefined();
        grid.getBlock(placed).setType("minecraft:air");
        lights.shine(car.id, car, wanted);
        expect(wanted.map(grid.typeAt)).toEqual(wanted.map(() => LIGHT_BLOCK));
      }),
    );
  });

  it("clears the light of a vehicle that is no longer loaded and keeps the light of a loaded one (ADR 0038)", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const grid = blockGrid();
        const car = vehicleIn(grid);
        const lights = new HeadlightBlocks();
        lights.shine(car.id, car, wanted);
        lights.clearGone(new Set([car.id]));
        expect(wanted.map(grid.typeAt)).toEqual(wanted.map(() => LIGHT_BLOCK));
        lights.clearGone(new Set());
        expect(wanted.map(grid.typeAt)).toEqual(
          wanted.map(() => "minecraft:air"),
        );
      }),
    );
  });
});
