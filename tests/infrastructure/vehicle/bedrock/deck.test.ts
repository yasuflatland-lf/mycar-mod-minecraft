import type { Player } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { standsOnDeck } from "../../../../src/infrastructure/vehicle/bedrock/deck";
import { DECK_FLOOR_BLOCK } from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { blockGrid } from "../../../support/blockGrid";

const DECK = { x: 0, y: 64, z: 0 };
const HALF_WIDTH = 0.3;
// Keeps generated positions away from the exact edge of the footprint, where
// the answer depends on the inset rather than on the rule under test.
const EDGE_GAP = 0.01;

function footingAt(
  location: { x: number; y: number; z: number },
  getBlock?: () => never,
) {
  const grid = blockGrid();
  grid.getBlock(DECK).setType(DECK_FLOOR_BLOCK);
  const dimension = { getBlock: getBlock ?? grid.getBlock };
  return { location, dimension } as unknown as Pick<
    Player,
    "location" | "dimension"
  >;
}

const overlapsDeckCell = (center: number) =>
  center + HALF_WIDTH > 0 && center - HALF_WIDTH < 1;

const nearFootprintEdge = (center: number) =>
  [center - HALF_WIDTH, center + HALF_WIDTH].some(
    (side) => Math.abs(side - Math.round(side)) < EDGE_GAP,
  );

const horizontal = fc.double({ min: -1.5, max: 2.5, noNaN: true });
// On top of a whole block, or inside a partial-height deck cell.
const feet = fc.oneof(
  fc.constant(DECK.y + 1),
  fc.double({ min: DECK.y + 0.05, max: DECK.y + 0.95, noNaN: true }),
);

describe("standsOnDeck", () => {
  it("is true exactly when the player's footprint overlaps a deck cell", () => {
    fc.assert(
      fc.property(horizontal, horizontal, feet, (x, z, y) => {
        fc.pre(!nearFootprintEdge(x) && !nearFootprintEdge(z));
        expect(standsOnDeck(footingAt({ x, y, z }))).toBe(
          overlapsDeckCell(x) && overlapsDeckCell(z),
        );
      }),
    );
  });

  it("counts a player whose center hangs over the water at the deck edge", () => {
    expect(standsOnDeck(footingAt({ x: 1.25, y: DECK.y + 1, z: 0.5 }))).toBe(
      true,
    );
    expect(standsOnDeck(footingAt({ x: 0.5, y: DECK.y + 1, z: -0.25 }))).toBe(
      true,
    );
  });

  it("is false when the player is not at the deck's height", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.oneof(
          fc.double({ min: DECK.y + 1.05, max: DECK.y + 10, noNaN: true }),
          fc.double({ min: DECK.y - 10, max: DECK.y - 0.05, noNaN: true }),
        ),
        (offset, y) => {
          expect(standsOnDeck(footingAt({ x: offset, y, z: offset }))).toBe(
            false,
          );
        },
      ),
    );
  });

  it("is false when the block cannot be read", () => {
    const unloaded = () => {
      throw new Error("unloaded");
    };
    expect(
      standsOnDeck(footingAt({ x: 0.5, y: DECK.y + 1, z: 0.5 }, unloaded)),
    ).toBe(false);
  });
});
