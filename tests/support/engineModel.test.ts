// tests/support/engineModel.test.ts
import { describe, expect, it } from "vitest";
import { engineStep, HALF_WIDTH } from "./engineModel";

describe("engineModel", () => {
  it("impulse を足して移動し、摩擦率を掛ける", () => {
    const r = engineStep(
      { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } },
      { x: 0, z: 1 },
      { mu: 0.5 },
    );
    expect(r.body.pos.z).toBe(1);
    expect(r.body.vel.z).toBe(0.5);
    expect(r.touching).toBe(false);
  });

  it("壁は +x 向きの成分だけを 0 にし、車体を壁の手前に止める", () => {
    const r = engineStep(
      { pos: { x: 9, z: 0 }, vel: { x: 0, z: 0 } },
      { x: 1, z: 0.3 },
      { mu: 1, wallX: 10 },
    );
    expect(r.body.pos.x).toBe(10 - HALF_WIDTH);
    expect(r.body.vel.x).toBe(0);
    expect(r.body.vel.z).toBeCloseTo(0.3);
    expect(r.touching).toBe(true);
  });
});
