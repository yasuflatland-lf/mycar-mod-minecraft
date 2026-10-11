import { describe, expect, it } from "vitest";
import { SPEC } from "../../src/domain/vehicle/spec";

describe("SPEC", () => {
  it("matches the values in the ADRs", () => {
    expect(SPEC.maxSpeed).toBe(0.9);
    expect(SPEC.maxReverse).toBe(0.2);
    expect(SPEC.accel).toBe(0.0225);
    expect(SPEC.grip).toBe(0.6);
    expect(SPEC.handbrakeGrip).toBe(0.04);
    expect(SPEC.hitsToBreak).toBe(3);
  });

  it("collision detection depth exceeds the maximum distance traveled in 1 tick (no passing through targets)", () => {
    expect(SPEC.bodyFront + SPEC.targetHalfWidth).toBeGreaterThan(
      SPEC.maxSpeed,
    );
  });

  it("flight values match ADR 0020", () => {
    expect(SPEC.doubleTapTicks).toBe(8);
    expect(SPEC.takeoffTicks).toBe(20);
    expect(SPEC.takeoffTicks * SPEC.takeoffClimb).toBeCloseTo(1.5);
    expect(SPEC.maxClimb).toBe(0.3);
    expect(SPEC.landingSink).toBe(0.15);
    expect(SPEC.pitchDeadzone).toBe(10);
  });
});
