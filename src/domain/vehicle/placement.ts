// src/domain/vehicle/placement.ts
// 車を置ける空間があるか (Review Focus)。当たり判定 (幅 1.8・高さ 1.6) が入る 3 × 2 × 3 ブロックを調べる。
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
