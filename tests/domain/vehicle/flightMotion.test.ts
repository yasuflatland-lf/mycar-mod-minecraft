import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dot,
  forward,
  length,
  type Vec2,
} from "../../../src/domain/shared/vec";
import type { DriveInput } from "../../../src/domain/vehicle/driveInput";
import {
  initialMotion,
  type MotionResult,
  type MotionState,
  stepFlightMotion,
  updateSpeed,
} from "../../../src/domain/vehicle/motion";
import { SPEC } from "../../../src/domain/vehicle/spec";

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
const component = fc.double({ min: -2, max: 2, noNaN: true });
const vec = fc.record({ x: component, z: component });
const flyingState = fc.record({
  speed: fc.double({ min: -SPEC.maxReverse, max: SPEC.maxSpeed, noNaN: true }),
  yaw: fc.double({ min: -180, max: 180, noNaN: true }),
  airExpected: vec,
});
const prevState = (s: {
  speed: number;
  yaw: number;
  airExpected: Vec2;
}): MotionState => ({ ...s, stepTicks: 0 });

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
          expect(r.jumpVelocity).toBe(0);
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

  it("reports a wall and drops to the forward speed when an expected axis comes back zero", () => {
    const axisValue = fc
      .double({ min: SPEC.blockedAxisMin, max: 2, noNaN: true })
      .filter((a) => a > SPEC.blockedAxisMin)
      .chain((a) => fc.constantFrom(a, -a));
    fc.assert(
      fc.property(
        flyingState,
        driveInput,
        fc.boolean(),
        axisValue,
        component,
        (s, input, onX, stopped, other) => {
          const e = onX
            ? { x: stopped, z: s.airExpected.z }
            : { x: s.airExpected.x, z: stopped };
          const v = onX ? { x: 0, z: other } : { x: other, z: 0 };
          const r = stepFlightMotion(
            prevState({ ...s, airExpected: e }),
            input,
            v,
          );
          expect(r.blocked).toBe(true);
          const vLong = dot(v, forward(r.state.yaw));
          expect(Math.abs(r.state.speed)).toBeLessThanOrEqual(
            Math.abs(vLong) + SPEC.accel + 1e-9,
          );
        },
      ),
    );
  });

  it("does not report a wall when the velocity keeps the free-flight share of what was given", () => {
    fc.assert(
      fc.property(flyingState, driveInput, (s, input) => {
        const e = s.airExpected;
        const v = { x: e.x * ENGINE_DRAG, z: e.z * ENGINE_DRAG };
        const r = stepFlightMotion(prevState(s), input, v);
        expect(r.blocked).toBe(false);
        expect(r.state.speed).toBe(
          updateSpeed(s.speed, input.throttle, input.creep),
        );
      }),
    );
  });
});

describe("stepFlightMotion walls and sideways velocity (ADR 0002, 0003)", () => {
  it("skips an axis whose given velocity is blockedAxisMin or less, whatever comes back on it (ADR 0003)", () => {
    const small = fc.oneof(
      fc.constantFrom(SPEC.blockedAxisMin, -SPEC.blockedAxisMin, 0),
      fc.double({
        min: -SPEC.blockedAxisMin,
        max: SPEC.blockedAxisMin,
        noNaN: true,
      }),
    );
    fc.assert(
      fc.property(
        flyingState,
        driveInput,
        fc.boolean(),
        small,
        component,
        (s, input, onX, tiny, back) => {
          const e = onX
            ? { x: tiny, z: s.airExpected.z }
            : { x: s.airExpected.x, z: tiny };
          const v = onX
            ? { x: back, z: e.z * ENGINE_DRAG }
            : { x: e.x * ENGINE_DRAG, z: back };
          const r = stepFlightMotion(
            prevState({ ...s, airExpected: e }),
            input,
            v,
          );
          expect(r.blocked).toBe(false);
        },
      ),
    );
  });

  it("does not report a wall when an axis keeps exactly half the drag share (ADR 0003)", () => {
    const kept = SPEC.flightDrag * SPEC.blockedRatio;
    const r = stepFlightMotion(
      prevState({ speed: 0.5, yaw: 0, airExpected: { x: 1, z: 1 } }),
      { throttle: 0, steer: 0, handbrake: false, creep: false },
      { x: kept, z: kept },
    );
    expect(r.blocked).toBe(false);
  });

  it("a wall never raises the internal speed (ADR 0003)", () => {
    fc.assert(
      fc.property(
        flyingState,
        driveInput,
        fc.boolean(),
        component,
        component,
        (s, input, onX, stopped, other) => {
          fc.pre(Math.abs(stopped) > SPEC.blockedAxisMin);
          const e = onX
            ? { x: stopped, z: s.airExpected.z }
            : { x: s.airExpected.x, z: stopped };
          const v = onX ? { x: 0, z: other } : { x: other, z: 0 };
          const r = stepFlightMotion(
            prevState({ ...s, airExpected: e }),
            input,
            v,
          );
          const free = Math.min(
            updateSpeed(s.speed, input.throttle, input.creep),
            SPEC.maxSpeed,
          );
          expect(Math.abs(r.state.speed)).toBeLessThanOrEqual(
            Math.abs(free) + 1e-12,
          );
        },
      ),
    );
  });

  it("aims for the internal speed forward and keeps 1 - grip of the sideways velocity (ADR 0002)", () => {
    const small = fc.integer({ min: -300, max: 300 }).map((n) => n / 1000);
    fc.assert(
      fc.property(
        fc.double({ min: -SPEC.maxReverse, max: 0.5, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        driveInput,
        small,
        small,
        (speed, yaw, input, vx, vz) => {
          const v = { x: vx, z: vz };
          const r = stepFlightMotion({ speed, yaw, stepTicks: 0 }, input, v);
          const f = forward(r.state.yaw);
          const aimed = {
            x: (v.x + r.impulse.x) * ENGINE_DRAG,
            z: (v.z + r.impulse.z) * ENGINE_DRAG,
          };
          const side = (u: Vec2) => {
            const l = dot(u, f);
            return { x: u.x - f.x * l, z: u.z - f.z * l };
          };
          const keep = 1 - SPEC.grip;
          expect(dot(aimed, f)).toBeCloseTo(r.state.speed, 9);
          expect(side(aimed).x).toBeCloseTo(side(v).x * keep, 9);
          expect(side(aimed).z).toBeCloseTo(side(v).z * keep, 9);
        },
      ),
    );
  });
});
