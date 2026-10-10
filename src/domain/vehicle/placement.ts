// src/domain/vehicle/placement.ts
// Whether there is room to place the vehicle (Review Focus). Checks the 3 × 2 × 3 blocks that fit the collision box (width 1.8, height 1.6).
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
