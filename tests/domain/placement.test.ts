// tests/domain/placement.test.ts
import { describe, expect, it } from "vitest";
import { canPlaceAt } from "../../src/domain/vehicle/placement";

describe("canPlaceAt (Review Focus)", () => {
  it("can place when a 3-wide × 2-high space is clear", () => {
    expect(canPlaceAt(() => true)).toBe(true);
  });

  it("cannot place under a low ceiling (second layer blocked)", () => {
    expect(
      canPlaceAt((dx, dy, dz) => !(dy === 2 && dx === 0 && dz === 0)),
    ).toBe(false);
  });

  it("cannot place against a wall (adjacent column blocked)", () => {
    expect(canPlaceAt((dx) => dx !== 1)).toBe(false);
  });
});
