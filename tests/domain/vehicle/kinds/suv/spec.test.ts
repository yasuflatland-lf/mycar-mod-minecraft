import { describe, expect, it } from "vitest";
import { SUV_SPEC } from "../../../../../src/domain/vehicle/kinds/suv/spec";
import { SPEC } from "../../../../../src/domain/vehicle/spec";

describe("SUV_SPEC", () => {
  it("keeps submarine buoyancy and speed within vehicle limits", () => {
    expect(SUV_SPEC.floatDraft).toBeLessThan(SUV_SPEC.carHeight);
    expect(SUV_SPEC.surfaceRise).toBeGreaterThan(0);
    expect(SUV_SPEC.surfaceRise).toBeLessThanOrEqual(SUV_SPEC.maxClimb);
    expect(SUV_SPEC.maxWaterSpeed).toBeLessThanOrEqual(SUV_SPEC.maxSpeed);
  });

  it("matches the values in the ADRs", () => {
    expect(SUV_SPEC.maxSpeed).toBe(0.9);
    expect(SUV_SPEC.maxReverse).toBe(0.2);
    expect(SUV_SPEC.accel).toBe(0.0225);
    expect(SUV_SPEC.grip).toBe(0.6);
    expect(SUV_SPEC.handbrakeGrip).toBe(0.04);
  });

  it("collision detection depth exceeds the maximum distance traveled in 1 tick (no passing through targets)", () => {
    expect(SUV_SPEC.bodyFront + SPEC.targetHalfWidth).toBeGreaterThan(
      SUV_SPEC.maxSpeed,
    );
  });

  it("flight values match ADR 0021", () => {
    expect(SUV_SPEC.doubleTapTicks).toBe(8);
    expect(SUV_SPEC.takeoffTicks).toBe(20);
    expect(SUV_SPEC.takeoffTicks * SUV_SPEC.takeoffClimb).toBeCloseTo(1.5);
    expect(SUV_SPEC.maxClimb).toBe(0.3);
    expect(SUV_SPEC.landingSink).toBe(0.15);
  });
});
