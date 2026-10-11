import { SPEC } from "./spec";

/**
 * Blocks of water above the feet, counting contiguous full cells from the
 * feet cell upward; dry feet give zero (ADR 0038).
 */
export function waterDepthFrom(
  feetY: number,
  isWater: (cellY: number) => boolean,
): number {
  const bottom = Math.floor(feetY);
  let cells = 0;
  const limit = Math.ceil(SPEC.carHeight) + 1;
  while (cells < limit && isWater(bottom + cells)) cells++;
  if (cells === 0) return 0;
  return Math.max(0, Math.min(bottom + cells - feetY, SPEC.carHeight + 1));
}
