import { SPEC } from "./spec";

/**
 * Blocks of water above the feet, counting contiguous full cells upward from
 * the cell that holds the feet (ADR 0040).
 */
export function waterDepthFrom(
  feetY: number,
  isWater: (cellY: number) => boolean,
): number {
  let bottom = Math.floor(feetY);
  let cells = 0;
  if (isWater(bottom)) cells = 1;
  // Feet resting on a partial block that cannot be waterlogged (mud and soul
  // sand top out at 0.875, dirt path and farmland at 0.9375) sit inside that
  // block's cell, so the water starts in the cell above it.
  else if (feetY > bottom) bottom += 1;
  else return 0;
  const maxCells = Math.ceil(SPEC.carHeight) + 1;
  while (cells < maxCells && isWater(bottom + cells)) cells++;
  if (cells === 0) return 0;
  return Math.min(bottom + cells - feetY, SPEC.carHeight + 1);
}
