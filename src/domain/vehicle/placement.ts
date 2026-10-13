// Where a vehicle goes when its item is used on a block (ADR 0008, ADR 0051),
// and whether there is room for it there.
import type { Vec3 } from "../shared/vec";

export type IsAir = (dx: number, dy: number, dz: number) => boolean;

/**
 * The cells that must be air for a kind to be placed: -halfX..halfX,
 * -halfZ..halfZ, and 1..height above the block. It must cover the kind's
 * collision box (ADR 0055).
 */
export interface Clearance {
  readonly halfX: number;
  readonly halfZ: number;
  readonly height: number;
}

export function canPlaceAt(isAir: IsAir, clearance: Clearance): boolean {
  // `0 - half` instead of `-half`, so a zero half-width asks 0 and not -0.
  for (let dx = 0 - clearance.halfX; dx <= clearance.halfX; dx++) {
    for (let dz = 0 - clearance.halfZ; dz <= clearance.halfZ; dz++) {
      for (let dy = 1; dy <= clearance.height; dy++) {
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

/**
 * "top": a click on the top face places on the clicked block. "water": the
 * clicked or the adjacent cell holds water; place on its column's top water cell.
 */
export type PlacementSurface = "top" | "water";

/** How a kind of vehicle is placed from its item (ADR 0050, ADR 0055). */
export interface PlacementRule {
  /** Tried in order; the first that matches gives the placement cell. */
  readonly surfaces: readonly PlacementSurface[];
  readonly clearance: Clearance;
}

/**
 * The cell the vehicle is placed on top of, or undefined when no surface
 * matches. "water" accepts any face but "top" only the top face, so a click on
 * the side of a shore with no water next to it never lifts a vehicle onto it.
 */
export function placementCell(
  rule: PlacementRule,
  clicked: Vec3,
  face: BlockFace,
  isWaterAt: (at: Vec3) => boolean,
  maxClimb = 16,
): Vec3 | undefined {
  for (const surface of rule.surfaces) {
    const cell = cellOnSurface(surface, clicked, face, isWaterAt, maxClimb);
    if (cell !== undefined) return cell;
  }
  return undefined;
}

function cellOnSurface(
  surface: PlacementSurface,
  clicked: Vec3,
  face: BlockFace,
  isWaterAt: (at: Vec3) => boolean,
  maxClimb: number,
): Vec3 | undefined {
  switch (surface) {
    case "top":
      return face === "up" ? clicked : undefined;
    case "water":
      return waterSurfaceCell(clicked, face, isWaterAt, maxClimb);
  }
}

function waterSurfaceCell(
  clicked: Vec3,
  face: BlockFace,
  isWaterAt: (at: Vec3) => boolean,
  maxClimb: number,
): Vec3 | undefined {
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
  return undefined;
}
