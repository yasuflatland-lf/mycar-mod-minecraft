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
