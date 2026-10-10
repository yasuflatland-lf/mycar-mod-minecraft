// tests/support/engineModel.test.ts
import { describe, expect, it } from "vitest";
import { engineStep, HALF_WIDTH } from "./engineModel";

describe("engineModel", () => {
  it("adds the impulse, moves, and applies the friction factor", () => {
    const r = engineStep(
      { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } },
      { x: 0, z: 1 },
      { mu: 0.5 },
    );
    expect(r.body.pos.z).toBe(1);
    expect(r.body.vel.z).toBe(0.5);
    expect(r.touching).toBe(false);
  });

  it("a wall zeroes only the +x component and stops the vehicle body in front of the wall", () => {
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
