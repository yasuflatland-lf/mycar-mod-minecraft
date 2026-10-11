import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { length, type Vec2 } from "../../src/domain/shared/vec";
import type { DriveInput } from "../../src/domain/vehicle/driveInput";
import {
  initialMotion,
  type MotionResult,
  stepFlightMotion,
} from "../../src/domain/vehicle/motion";
import { SPEC } from "../../src/domain/vehicle/spec";

// The in-game flight_cruise test checks this assumption against the engine.
const ENGINE_DRAG = SPEC.flightDrag;

function fly(inputs: readonly DriveInput[]): { r: MotionResult; vel: Vec2 }[] {
  let state = initialMotion(0);
  let vel: Vec2 = { x: 0, z: 0 };
  return inputs.map((input) => {
    const r = stepFlightMotion(state, input, vel);
    state = r.state;
    vel = {
      x: (vel.x + r.impulse.x) * ENGINE_DRAG,
      z: (vel.z + r.impulse.z) * ENGINE_DRAG,
    };
    return { r, vel };
  });
}

const driveInput = fc.record({
  throttle: fc.double({ min: -1, max: 1, noNaN: true }),
  steer: fc.double({ min: -1, max: 1, noNaN: true }),
  handbrake: fc.boolean(),
  creep: fc.boolean(),
});
const inputs = fc.array(driveInput, { minLength: 1, maxLength: 300 });

describe("stepFlightMotion (ADR 0021)", () => {
  it("keeps horizontal speed within max speed", () => {
    fc.assert(
      fc.property(inputs, (ins) => {
        for (const { vel } of fly(ins))
          expect(length(vel)).toBeLessThanOrEqual(SPEC.maxSpeed + 1e-9);
      }),
    );
  });

  it("never jumps a step, never reports a wall, and keeps no ground friction bookkeeping", () => {
    fc.assert(
      fc.property(inputs, (ins) => {
        for (const { r } of fly(ins)) {
          expect(r.jumped).toBe(false);
          expect(r.blocked).toBe(false);
          expect(r.state.expected).toBeUndefined();
          expect(r.state.stepTicks).toBe(0);
        }
      }),
    );
  });

  it("ignores the handbrake", () => {
    fc.assert(
      fc.property(inputs, (ins) => {
        const off = fly(ins.map((i) => ({ ...i, handbrake: false })));
        const on = fly(ins.map((i) => ({ ...i, handbrake: true })));
        expect(on.map((f) => f.vel)).toEqual(off.map((f) => f.vel));
      }),
    );
  });

  it("reaches 95% of max speed within 45 ticks at full throttle", () => {
    const frames = fly(
      Array.from({ length: 45 }, () => ({
        throttle: 1,
        steer: 0,
        handbrake: false,
        creep: false,
      })),
    );
    const last = frames.at(-1)?.vel ?? { x: 0, z: 0 };
    expect(length(last)).toBeGreaterThanOrEqual(SPEC.maxSpeed * 0.95);
  });
});
