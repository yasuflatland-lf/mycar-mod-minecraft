// tests/domain/spec.test.ts
import { describe, expect, it } from "vitest";
import { SPEC } from "../../src/domain/vehicle/spec";

describe("SPEC", () => {
  it("ADR の値と一致する", () => {
    expect(SPEC.maxSpeed).toBe(0.9);
    expect(SPEC.maxReverse).toBe(0.2);
    expect(SPEC.accel).toBe(0.0225);
    expect(SPEC.grip).toBe(0.6);
    expect(SPEC.handbrakeGrip).toBe(0.04);
    expect(SPEC.hitsToBreak).toBe(3);
  });

  it("衝突判定の奥行きは 1 tick の最大移動距離より長い (すり抜けない)", () => {
    expect(SPEC.bodyFront + SPEC.targetHalfWidth).toBeGreaterThan(
      SPEC.maxSpeed,
    );
  });
});
