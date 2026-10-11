import { SPEC } from "./spec";

/**
 * Blocks of water above the feet, counting contiguous full cells from the
 * feet cell upward; dry feet give zero (ADR 0039).
 */
export function waterDepthFrom(
  feetY: number,
  isWater: (cellY: number) => boolean,
): number {
  const bottom = Math.floor(feetY);
  const maxCells = Math.ceil(SPEC.carHeight) + 1;
  let cells = 0;
  while (cells < maxCells && isWater(bottom + cells)) cells++;
  if (cells === 0) return 0;
  return Math.min(bottom + cells - feetY, SPEC.carHeight + 1);
}
