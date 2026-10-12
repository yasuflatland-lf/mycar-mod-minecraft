import type { Player } from "@minecraft/server";
import { DECK_FLOOR_BLOCK } from "./identifiers";

// At a whole-y block top, floor(location.y) is the cell above the floor block;
// on a partial-height block, the feet are inside the floor cell (ADR 0063).
const BELOW_FEET_OFFSET = 0.01;

// A player's collision box is 0.6 wide, and the player stays on a block until
// the whole box has left it, so at the deck edge the center can sit up to 0.3
// over the water. The small inset keeps a box that only touches a cell's side
// from counting as standing on it.
const FOOTPRINT_HALF_WIDTH = 0.3 - 1e-4;

type Footing = Pick<Player, "location" | "dimension">;

export function standsOnDeck(player: Footing): boolean {
  try {
    const { location, dimension } = player;
    const floorLevels = [location.y, location.y - BELOW_FEET_OFFSET].map(
      Math.floor,
    );
    for (const y of floorLevels) {
      for (const x of footprintCells(location.x)) {
        for (const z of footprintCells(location.z)) {
          if (dimension.getBlock({ x, y, z })?.typeId === DECK_FLOOR_BLOCK) {
            return true;
          }
        }
      }
    }
    return false;
  } catch {
    return false; // Unloaded chunk or outside the world
  }
}

function footprintCells(center: number): number[] {
  const low = Math.floor(center - FOOTPRINT_HALF_WIDTH);
  const high = Math.floor(center + FOOTPRINT_HALF_WIDTH);
  return low === high ? [low] : [low, high];
}
