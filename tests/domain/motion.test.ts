// tests/domain/motion.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dot, forward, length, type Vec2 } from "../../src/domain/shared/vec";
import type { DriveInput } from "../../src/domain/vehicle/driveInput";
import { NEUTRAL_INPUT } from "../../src/domain/vehicle/driveInput";
import {
  initialMotion,
  type MotionState,
  steerYaw,
  stepMotion,
  updateSpeed,
} from "../../src/domain/vehicle/motion";
import { SPEC } from "../../src/domain/vehicle/spec";
import { type Body, type Engine, engineStep } from "../support/engineModel";

const noStep = () => false;

interface Frame {
  state: MotionState;
  body: Body;
  touching: boolean;
}

function simulate(
  inputs: DriveInput[],
  engine: Engine,
  yaw0 = 0,
  start: Vec2 = { x: 0, z: 0 },
): Frame[] {
  let state = initialMotion(yaw0);
  let body: Body = { pos: start, vel: { x: 0, z: 0 } };
  const frames: Frame[] = [];
  for (const input of inputs) {
    const r = stepMotion(
      state,
      input,
      { velocity: body.vel, onGround: true },
      noStep,
    );
    state = r.state;
    const e = engineStep(body, r.impulse, engine);
    body = e.body;
    frames.push({ state, body, touching: e.touching });
  }
  return frames;
}

const lateral = (v: Vec2, yaw: number): number => {
  const f = forward(yaw);
  const l = dot(v, f);
  return Math.hypot(v.x - f.x * l, v.z - f.z * l);
};

const driveInput = fc.record({
  throttle: fc.double({ min: -1, max: 1, noNaN: true }),
  steer: fc.double({ min: -1, max: 1, noNaN: true }),
  handbrake: fc.boolean(),
});
const inputs = fc.array(driveInput, { minLength: 1, maxLength: 300 });
const mu = fc.double({ min: 0.6, max: 0.75, noNaN: true });

describe("updateSpeed / steerYaw", () => {
  it("reaches 95% of max speed in about 40 ticks at full throttle", () => {
    let s = 0;
    let t = 0;
    while (s < SPEC.maxSpeed * 0.95) {
      s = updateSpeed(s, 1);
      t++;
    }
    expect(t).toBeGreaterThanOrEqual(35);
    expect(t).toBeLessThanOrEqual(42);
  });

  it("coasts to a stop without input and without reversing the sign of speed", () => {
    let s: number = SPEC.maxSpeed;
    for (let i = 0; i < 100; i++) s = updateSpeed(s, 0);
    expect(s).toBe(0);
  });

  it("steering does not change heading when stopped and turns the opposite way in reverse", () => {
    expect(steerYaw(10, 0, 1)).toBe(10);
    expect(steerYaw(10, 0.5, 1)).toBeLessThan(10);
    expect(steerYaw(10, -0.1, 1)).toBeGreaterThan(10);
  });

  it("keeps heading within (-180, 180] regardless of how many turns it makes", () => {
    let yaw = 0;
    for (let i = 0; i < 10_000; i++) yaw = steerYaw(yaw, SPEC.maxSpeed, 1);
    expect(yaw).toBeGreaterThan(-180);
    expect(yaw).toBeLessThanOrEqual(180);
  });
});

describe("stepMotion (properties, ADR 0002/0003)", () => {
  it("horizontal velocity on the ground stays within max speed (up to 10% estimation error during the first 30 ticks)", () => {
    fc.assert(
      fc.property(inputs, mu, (ins, m) => {
        simulate(ins, { mu: m }).forEach((fr, i) => {
          const limit = SPEC.maxSpeed * (i < 30 ? 1.1 : 1.02);
          expect(length(fr.body.vel)).toBeLessThanOrEqual(limit + 1e-9);
        });
      }),
    );
  });

  it("keeps internal speed between the reverse limit and max speed even when hitting a wall", () => {
    const wall = fc.option(fc.double({ min: 2, max: 20, noNaN: true }), {
      nil: undefined,
    });
    const yaw0 = fc.double({ min: -180, max: 180, noNaN: true });
    fc.assert(
      fc.property(inputs, mu, wall, yaw0, (ins, m, w, y) => {
        for (const fr of simulate(ins, { mu: m, wallX: w }, y)) {
          expect(fr.state.speed).toBeGreaterThanOrEqual(
            -SPEC.maxReverse - 1e-9,
          );
          expect(fr.state.speed).toBeLessThanOrEqual(SPEC.maxSpeed + 1e-9);
        }
      }),
    );
  });

  it("does not detect collisions on ground without walls", () => {
    fc.assert(
      fc.property(inputs, mu, (ins, m) => {
        for (const fr of simulate(ins, { mu: m }))
          expect(fr.state.blocked).toBe(false);
      }),
    );
  });

  it("sideways velocity decreases without increasing after input stops", () => {
    const quiet: DriveInput[] = Array.from({ length: 60 }, () => NEUTRAL_INPUT);
    fc.assert(
      fc.property(inputs, mu, (warm, m) => {
        const frames = simulate([...warm, ...quiet], { mu: m });
        for (let i = warm.length + 1; i < frames.length; i++) {
          const prev = frames[i - 1]!;
          const cur = frames[i]!;
          expect(lateral(cur.body.vel, cur.state.yaw)).toBeLessThanOrEqual(
            lateral(prev.body.vel, prev.state.yaw) + 1e-9,
          );
        }
      }),
    );
  });

  it("stops when hitting a wall at an angle, with speed along the wall no greater than the along-wall component just before impact", () => {
    const yaw0 = fc.double({ min: -130, max: -50, noNaN: true }); // Faces roughly toward +x (the wall)
    const wallX = fc.double({ min: 8, max: 20, noNaN: true });
    fc.assert(
      fc.property(yaw0, wallX, mu, (y, w, m) => {
        const full: DriveInput[] = Array.from({ length: 200 }, () => ({
          throttle: 1,
          steer: 0,
          handbrake: false,
        }));
        const frames = simulate(full, { mu: m, wallX: w }, y);
        const first = frames.findIndex((f) => f.touching);
        expect(first).toBeGreaterThan(0);
        const before = Math.abs(frames[first - 1]!.body.vel.z);
        for (let i = first; i < frames.length; i++) {
          expect(Math.abs(frames[i]!.body.vel.z)).toBeLessThanOrEqual(
            before + 0.05,
          );
        }
        expect(frames.slice(first + 2).some((f) => f.state.blocked)).toBe(true);
      }),
    );
  });

  it("slides sideways more under the handbrake than during normal driving", () => {
    const run = (hb: boolean) => {
      const accel: DriveInput[] = Array.from({ length: 60 }, () => ({
        throttle: 1,
        steer: 0,
        handbrake: false,
      }));
      const turn: DriveInput[] = Array.from({ length: 20 }, () => ({
        throttle: 1,
        steer: 1,
        handbrake: hb,
      }));
      const frames = simulate([...accel, ...turn], { mu: 0.688 });
      return Math.max(
        ...frames.slice(60).map((f) => lateral(f.body.vel, f.state.yaw)),
      );
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it("reports an upward jump when jumping up a step and raises internal speed to the minimum", () => {
    const r = stepMotion(
      initialMotion(0),
      { throttle: 1, steer: 0, handbrake: false },
      { velocity: { x: 0, z: 0 }, onGround: true },
      () => true,
    );
    expect(r.jumped).toBe(true);
    expect(r.state.speed).toBeGreaterThanOrEqual(SPEC.stepMinSpeed);
    expect(r.state.stepTicks).toBe(SPEC.stepTicks - 1);
  });
});
