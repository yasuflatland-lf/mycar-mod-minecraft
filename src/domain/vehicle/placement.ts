// Where a vehicle goes when its item is used on a block (ADR 0008, ADR 0051),
// and whether there is room for it there.
import type { Vec3 } from "../shared/vec";

// Checks the 3 × 2 × 3 blocks that fit the 1.8-wide, 1.6-high collision box (ADR 0009).
export type IsAir = (dx: number, dy: number, dz: number) => boolean;

export function canPlaceAt(isAir: IsAir): boolean {
  for (const dx of [-1, 0, 1]) {
    for (const dz of [-1, 0, 1]) {
      for (const dy of [1, 2]) {
        if (!isAir(dx, dy, dz)) return false;
      }
    }
  }
  return true;
}

/**
 * The top water cell of the contiguous column above `startY`, or `startY` when
 * the cell above is dry (ADR 0051). It climbs at most `maxClimb` cells: a deeper
 * column returns `startY + maxClimb`, a submerged cell where placement fails
 * because the cells above it are water, not air.
 */
export function surfaceCellY(
  startY: number,
  isWaterAt: (y: number) => boolean,
  maxClimb = 16,
): number {
  let y = startY;
  while (y - startY < maxClimb && isWaterAt(y + 1)) y++;
  return y;
}

/** The face of a block that was clicked. */
export type BlockFace = "up" | "down" | "north" | "south" | "east" | "west";

export const FACE_OFFSET: Readonly<Record<BlockFace, Vec3>> = Object.freeze({
  up: Object.freeze({ x: 0, y: 1, z: 0 }),
  down: Object.freeze({ x: 0, y: -1, z: 0 }),
  north: Object.freeze({ x: 0, y: 0, z: -1 }),
  south: Object.freeze({ x: 0, y: 0, z: 1 }),
  east: Object.freeze({ x: 1, y: 0, z: 0 }),
  west: Object.freeze({ x: -1, y: 0, z: 0 }),
});

/** How a kind of vehicle is placed from its item (ADR 0050). */
export interface PlacementRule {
  /** Whether a click next to or on water places the vehicle at the water surface. */
  readonly onWater: boolean;
  /** Whether a click on any face counts, not only on the top face. */
  readonly anyFace: boolean;
}

/**
 * The cell the vehicle is placed on top of, or undefined when the click places
 * nothing. A water kind looks at the clicked cell and then at the cell next to
 * the clicked face; the first one that holds water gives the top water cell of
 * its column. Otherwise only a top-face click places the vehicle, on the
 * clicked block, as on land. A side or bottom face with no water next to it
 * places nothing, so a click on the side of a shore never lifts a boat onto it.
 */
export function placementCell(
  rule: PlacementRule,
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
