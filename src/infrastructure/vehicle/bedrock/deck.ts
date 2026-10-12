import type { Player } from "@minecraft/server";
import { DECK_FLOOR_BLOCK } from "./identifiers";

// At a whole-y block top, floor(location.y) is the cell above the floor block;
// on a partial-height block, the feet are inside the floor cell (ADR 0063).
const BELOW_FEET_OFFSET = 0.01;

export function standsOnDeck(player: Player): boolean {
  try {
    const { location, dimension } = player;
    const x = Math.floor(location.x);
    const z = Math.floor(location.z);
    return [location.y, location.y - BELOW_FEET_OFFSET].some(
      (y) =>
        dimension.getBlock({ x, y: Math.floor(y), z })?.typeId ===
        DECK_FLOOR_BLOCK,
    );
  } catch {
    return false; // Unloaded chunk or outside the world
  }
}
