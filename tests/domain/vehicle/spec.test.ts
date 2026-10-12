import { describe, expect, it } from "vitest";
import { SPEC } from "../../../src/domain/vehicle/spec";

describe("SPEC", () => {
  it("keeps the water breathing effect longer than its refresh interval", () => {
    expect(SPEC.waterBreathingTicks).toBeGreaterThan(
      SPEC.waterBreathingInterval,
    );
  });

  it("matches the values in the ADRs", () => {
    expect(SPEC.hitsToBreak).toBe(3);
  });
});
