// Whether there is room to place a vehicle from its item (ADR 0008). Checks the
// 3 × 2 × 3 blocks that fit the 1.8-wide, 1.6-high collision box (ADR 0009).
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

/** The top water cell of the contiguous column above `startY`, or `startY` when the cell above is dry (ADR 0051). */
export function surfaceCellY(
  startY: number,
  isWaterAt: (y: number) => boolean,
  maxClimb = 16,
): number {
  let y = startY;
  while (y - startY < maxClimb && isWaterAt(y + 1)) y++;
  return y;
}
