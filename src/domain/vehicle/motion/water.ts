import type { Vec3 } from "../../shared/vec";

/**
 * Blocks of water above the feet, counting contiguous full cells upward from
 * the cell that holds the feet, capped at maxHeight + 1 (ADR 0040).
 * Query cell centers to avoid rounding into the cell below.
 */
export function waterDepthAt(
  location: Vec3,
  waterAt: (offset: Vec3) => boolean,
  maxHeight: number,
): number {
  const feetY = location.y;
  const isWater = (cellY: number) =>
    waterAt({ x: 0, y: cellY + 0.5 - feetY, z: 0 });
  let bottom = Math.floor(feetY);
  let cells = 0;
  if (isWater(bottom)) cells = 1;
  // Feet resting on a partial block that cannot be waterlogged (mud and soul
  // sand top out at 0.875, dirt path and farmland at 0.9375) sit inside that
  // block's cell, so the water starts in the cell above it.
  else if (feetY > bottom) bottom += 1;
  else return 0;
  const maxCells = Math.ceil(maxHeight) + 1;
  while (cells < maxCells && isWater(bottom + cells)) cells++;
  if (cells === 0) return 0;
  return Math.min(bottom + cells - feetY, maxHeight + 1);
}

/** Whether the cell 0.3 blocks below the feet holds water (ADR 0051). */
export function waterBelowAt(waterAt: (offset: Vec3) => boolean): boolean {
  return waterAt({ x: 0, y: -0.3, z: 0 });
}
