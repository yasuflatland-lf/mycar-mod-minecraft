import type { Player } from "@minecraft/server";
import { DECK_FLOOR_BLOCK } from "./identifiers";

// At a whole-y block top, floor(location.y) is the cell above the floor block;
// on a partial-height block, the feet are inside the floor cell (ADR 0063).
const BELOW_FEET_OFFSET = 0.01;

export function standsOnDeck(player: Player): boolean {
  try {
    const { location, dimension } = player;
    const cell = {
      x: Math.floor(location.x),
      y: Math.floor(location.y),
      z: Math.floor(location.z),
    };
    return (
      dimension.getBlock(cell)?.typeId === DECK_FLOOR_BLOCK ||
      dimension.getBlock({
        ...cell,
        y: Math.floor(location.y - BELOW_FEET_OFFSET),
      })?.typeId === DECK_FLOOR_BLOCK
    );
  } catch {
    return false; // Unloaded chunk or outside the world
  }
}
