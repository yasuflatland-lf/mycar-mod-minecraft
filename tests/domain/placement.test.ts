// tests/domain/placement.test.ts
import { describe, expect, it } from "vitest";
import { canPlaceAt } from "../../src/domain/vehicle/placement";

describe("canPlaceAt (Review Focus)", () => {
  it("幅 3 × 高さ 2 が空いていれば置ける", () => {
    expect(canPlaceAt(() => true)).toBe(true);
  });

  it("天井が低い (2 段目がふさがっている) と置けない", () => {
    expect(
      canPlaceAt((dx, dy, dz) => !(dy === 2 && dx === 0 && dz === 0)),
    ).toBe(false);
  });

  it("壁ぎわ (隣の列がふさがっている) だと置けない", () => {
    expect(canPlaceAt((dx) => dx !== 1)).toBe(false);
  });
});
