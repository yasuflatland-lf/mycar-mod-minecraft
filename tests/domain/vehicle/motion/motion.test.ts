import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  clampLength,
  dot,
  forward,
  length,
  type Vec2,
} from "../../../../src/domain/shared/vec";
import {
  type DriveInput,
  NEUTRAL_INPUT,
} from "../../../../src/domain/vehicle/driveInput";
import { SUV_MOTION } from "../../../../src/domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../../../src/domain/vehicle/kinds/suv/spec";
import { MOTION } from "../../../../src/domain/vehicle/motion/constants";
import {
  alignOnMount,
  initialMotion,
  type MotionState,
  steerYaw,
  stepMotion,
  updateSpeed,
} from "../../../../src/domain/vehicle/motion/motion";
import { SPEC } from "../../../../src/domain/vehicle/spec";
import { defined } from "../../../support/defined";
import {
  type Body,
  type Engine,
  engineStep,
} from "../../../support/engineModel";

const FULL_THROTTLE: DriveInput = {
  throttle: 1,
  steer: 0,
  handbrake: false,
  creep: false,
};

function repeat(input: DriveInput, ticks: number): DriveInput[] {
  return Array.from({ length: ticks }, () => input);
}

interface Frame {
  state: MotionState;
  body: Body;
  touching: boolean;
  blocked: boolean;
  jumpVelocity: number;
  onGround: boolean;
}

/** Per-tick terrain: whether the vehicle is on the ground and whether a step lies ahead. */
interface Terrain {
  onGround: boolean;
  step: boolean;
}
const FLAT: Terrain = { onGround: true, step: false };

function simulate(
  inputs: DriveInput[],
  engine: Engine,
  yaw0 = 0,
  terrain: readonly Terrain[] = [],
): Frame[] {
  let state = initialMotion(yaw0);
  let body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const frames: Frame[] = [];
  inputs.forEach((input, i) => {
    const t = terrain[i] ?? FLAT;
    const r = stepMotion(
      state,
      input,
      { velocity: body.vel, onGround: t.onGround },
      () => (t.step ? 2 : 0),
      SUV_MOTION,
    );
    state = r.state;
    const e = engineStep(body, r.impulse, engine, t.onGround);
    body = e.body;
    frames.push({
      state,
      body,
      touching: e.touching,
      blocked: r.blocked,
      jumpVelocity: r.jumpVelocity,
      onGround: t.onGround,
    });
  });
  return frames;
}

function lateral(v: Vec2, yaw: number): number {
  const f = forward(yaw);
  const l = dot(v, f);
  return Math.hypot(v.x - f.x * l, v.z - f.z * l);
}

const driveInput = fc.record({
  throttle: fc.double({ min: -1, max: 1, noNaN: true }),
  steer: fc.double({ min: -1, max: 1, noNaN: true }),
  handbrake: fc.boolean(),
  creep: fc.boolean(),
});
const inputs = fc.array(driveInput, { minLength: 1, maxLength: 300 });
const mu = fc.double({ min: 0.6, max: 0.75, noNaN: true });
// Enough speed for the friction estimate to run, which random throttle rarely builds.
const forwardInputs = inputs.map((ins) =>
  ins.map((i) => ({ ...i, throttle: Math.abs(i.throttle) })),
);
// Runs of ground and air ticks, with an occasional step ahead.
const terrain = fc
  .array(
    fc.record({
      onGround: fc.boolean(),
      step: fc.boolean(),
      ticks: fc.integer({ min: 1, max: 30 }),
    }),
    { maxLength: 30 },
  )
  .map((runs) =>
    runs.flatMap(({ onGround, step, ticks }) =>
      Array.from({ length: ticks }, (_, i) => ({
        onGround,
        step: step && i === 0,
      })),
    ),
  );

describe("alignOnMount (ADR 0019)", () => {
  it("takes the driver's yaw only below mountAlignSpeed and changes nothing else", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.oneof(
          fc.double({ min: -1, max: 1, noNaN: true }),
          fc.constantFrom(
            MOTION.mountAlignSpeed,
            -MOTION.mountAlignSpeed,
            MOTION.mountAlignSpeed * (1 - 1e-9),
            -MOTION.mountAlignSpeed * (1 - 1e-9),
            0,
          ),
        ),
        fc.option(fc.double({ min: 0.5, max: 1, noNaN: true }), {
          nil: undefined,
        }),
        fc.integer({ min: 0, max: MOTION.stepTicks }),
        (yaw, driverYaw, speed, friction, stepTicks) => {
          const state: MotionState = {
            ...initialMotion(yaw),
            speed,
            friction,
            stepTicks,
          };
          const out = alignOnMount(state, driverYaw);
          expect(out).toStrictEqual({
            ...state,
            yaw:
              Math.abs(speed) < MOTION.mountAlignSpeed ? driverYaw : state.yaw,
          });
        },
      ),
    );
  });
});

describe("updateSpeed / steerYaw", () => {
  const forwardThrottle = fc.double({
    min: 0,
    max: 1,
    minExcluded: true,
    noNaN: true,
  });
  // maxExcluded still yields -0, which coasts instead of applying reverse throttle.
  const reverseThrottle = fc
    .double({ min: -1, max: 0, maxExcluded: true, noNaN: true })
    .filter((t) => t < 0);

  it("reaches 95% of max speed in about 40 ticks at full throttle", () => {
    let s = 0;
    let t = 0;
    while (s < SUV_SPEC.maxSpeed * 0.95) {
      s = updateSpeed(s, 1, false, SUV_MOTION);
      t++;
    }
    expect(t).toBeGreaterThanOrEqual(35);
    expect(t).toBeLessThanOrEqual(42);
  });

  it("coasts to a stop without input and without reversing the sign of speed", () => {
    let s: number = SUV_SPEC.maxSpeed;
    for (let i = 0; i < 100; i++) s = updateSpeed(s, 0, false, SUV_MOTION);
    expect(s).toBe(0);
  });

  it("creeping speeds up to the creep speed from a stop or from reversing, and never past it", () => {
    fc.assert(
      fc.property(
        fc.double({
          min: -SUV_SPEC.maxReverse,
          max: SUV_SPEC.creepSpeed,
          noNaN: true,
        }),
        (start) => {
          let s = start;
          for (let i = 0; i < 100; i++) {
            const next = updateSpeed(s, 0, true, SUV_MOTION);
            expect(next).toBeGreaterThanOrEqual(s);
            expect(next).toBeLessThanOrEqual(SUV_SPEC.creepSpeed);
            s = next;
          }
          expect(s).toBe(SUV_SPEC.creepSpeed);
        },
      ),
    );
  });

  it("creeping above the creep speed coasts down to it, like no input, and stops there", () => {
    fc.assert(
      fc.property(
        fc.double({
          min: SUV_SPEC.creepSpeed,
          max: SUV_SPEC.maxSpeed,
          noNaN: true,
        }),
        (start) => {
          expect(updateSpeed(start, 0, true, SUV_MOTION)).toBe(
            Math.max(
              SUV_SPEC.creepSpeed,
              updateSpeed(start, 0, false, SUV_MOTION),
            ),
          );
          let s = start;
          for (let i = 0; i < 100; i++) s = updateSpeed(s, 0, true, SUV_MOTION);
          expect(s).toBe(SUV_SPEC.creepSpeed);
        },
      ),
    );
  });

  it("creeping below the creep speed changes speed as full throttle does, capped at the creep speed (ADR 0018)", () => {
    const below = fc.oneof(
      fc.constant(0),
      fc.double({
        min: -SUV_SPEC.maxReverse,
        max: SUV_SPEC.creepSpeed,
        maxExcluded: true,
        noNaN: true,
      }),
    );
    fc.assert(
      fc.property(below, (s) => {
        expect(updateSpeed(s, 0, true, SUV_MOTION)).toBe(
          Math.min(SUV_SPEC.creepSpeed, updateSpeed(s, 1, false, SUV_MOTION)),
        );
      }),
    );
    expect(updateSpeed(0, 0, true, SUV_MOTION)).toBe(SUV_SPEC.accel);
    expect(updateSpeed(-0.1, 0, true, SUV_MOTION)).toBeCloseTo(
      -0.1 + SUV_SPEC.brake,
      12,
    );
  });

  it("forward throttle accelerates by accel times throttle from a standstill or moving forward, up to max speed (ADR 0002)", () => {
    const speed = fc.oneof(
      fc.constant(0),
      fc.double({ min: 0, max: SUV_SPEC.maxSpeed, noNaN: true }),
    );
    fc.assert(
      fc.property(speed, forwardThrottle, (s, t) => {
        expect(updateSpeed(s, t, false, SUV_MOTION)).toBeCloseTo(
          Math.min(SUV_SPEC.maxSpeed, s + SUV_SPEC.accel * t),
          12,
        );
      }),
    );
  });

  it("forward throttle while reversing brakes by brake times throttle (ADR 0002)", () => {
    // A filter, because max: 0 also yields 0 and -0, which are a standstill, not reversing.
    const speed = fc
      .double({ min: -SUV_SPEC.maxReverse, max: 0, noNaN: true })
      .filter((s) => s < 0);
    fc.assert(
      fc.property(speed, forwardThrottle, (s, t) => {
        expect(updateSpeed(s, t, false, SUV_MOTION)).toBeCloseTo(
          s + SUV_SPEC.brake * t,
          12,
        );
      }),
    );
  });

  it("reverse throttle while moving forward brakes by brake times throttle (ADR 0002)", () => {
    const speed = fc
      .double({ min: 0, max: SUV_SPEC.maxSpeed, noNaN: true })
      .filter((s) => s > 0);
    fc.assert(
      fc.property(speed, reverseThrottle, (s, t) => {
        expect(updateSpeed(s, t, false, SUV_MOTION)).toBeCloseTo(
          s + SUV_SPEC.brake * t,
          12,
        );
      }),
    );
  });

  it("reverse throttle from a standstill or reversing accelerates backward by reverseAccel times throttle, down to the reverse limit (ADR 0002)", () => {
    const speed = fc.oneof(
      fc.constant(0),
      fc.double({ min: -SUV_SPEC.maxReverse, max: 0, noNaN: true }),
    );
    fc.assert(
      fc.property(speed, reverseThrottle, (s, t) => {
        expect(updateSpeed(s, t, false, SUV_MOTION)).toBeCloseTo(
          Math.max(-SUV_SPEC.maxReverse, s + SUV_SPEC.reverseAccel * t),
          12,
        );
      }),
    );
  });

  it("turns at the full turn rate at or above steerFullSpeed, mirrored in reverse (ADR 0002)", () => {
    const fwd = fc.double({
      min: SUV_SPEC.steerFullSpeed,
      max: SUV_SPEC.maxSpeed,
      noNaN: true,
    });
    const rev = fc.double({
      min: SUV_SPEC.steerFullSpeed,
      max: SUV_SPEC.maxReverse,
      noNaN: true,
    });
    const steer = fc.double({ min: -1, max: 1, noNaN: true });
    fc.assert(
      fc.property(fwd, rev, steer, (fwd, rev, st) => {
        expect(steerYaw(0, fwd, st, SUV_MOTION)).toBeCloseTo(
          -st * SUV_SPEC.turnRate,
          9,
        );
        expect(steerYaw(0, -rev, st, SUV_MOTION)).toBeCloseTo(
          st * SUV_SPEC.turnRate,
          9,
        );
      }),
    );
  });

  it("up to steerFullSpeed, turns forward in proportion to speed", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: SUV_SPEC.steerFullSpeed, noNaN: true }),
        (s) => {
          expect(steerYaw(0, s, 1, SUV_MOTION)).toBeCloseTo(
            (-SUV_SPEC.turnRate * s) / SUV_SPEC.steerFullSpeed,
            9,
          );
        },
      ),
    );
  });

  it("the creep speed is below the ram threshold, so creeping never damages mobs (ADR 0006)", () => {
    expect(SUV_SPEC.creepSpeed).toBeLessThan(SPEC.ramMinSpeed);
  });

  it("steering does not change heading when stopped and turns the opposite way in reverse", () => {
    expect(steerYaw(10, 0, 1, SUV_MOTION)).toBe(10);
    expect(steerYaw(10, 0.5, 1, SUV_MOTION)).toBeLessThan(10);
    expect(steerYaw(10, -0.1, 1, SUV_MOTION)).toBeGreaterThan(10);
  });

  it("keeps heading within (-180, 180] regardless of how many turns it makes", () => {
    let yaw = 0;
    for (let i = 0; i < 10_000; i++)
      yaw = steerYaw(yaw, SUV_SPEC.maxSpeed, 1, SUV_MOTION);
    expect(yaw).toBeGreaterThan(-180);
    expect(yaw).toBeLessThanOrEqual(180);
  });
});

describe("stepMotion (properties, ADR 0002/0003)", () => {
  it("horizontal velocity stays within max speed on the ground, in the air, and over steps (up to 10% estimation error during the first 30 ticks)", () => {
    fc.assert(
      fc.property(inputs, mu, terrain, (ins, m, ter) => {
        simulate(ins, { mu: m }, 0, ter).forEach((fr, i) => {
          const limit = SUV_SPEC.maxSpeed * (i < 30 ? 1.1 : 1.02);
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
            -SUV_SPEC.maxReverse - 1e-9,
          );
          expect(fr.state.speed).toBeLessThanOrEqual(SUV_SPEC.maxSpeed + 1e-9);
        }
      }),
    );
  });

  it("does not detect collisions without walls, including on landing", () => {
    fc.assert(
      fc.property(inputs, mu, terrain, (ins, m, ter) => {
        for (const fr of simulate(ins, { mu: m }, 0, ter))
          expect(fr.blocked).toBe(false);
      }),
    );
  });

  it("updates the friction estimate only when this tick and the previous one were on the ground", () => {
    fc.assert(
      fc.property(forwardInputs, mu, terrain, (ins, m, ter) => {
        const frames = simulate(ins, { mu: m }, 0, ter);
        frames.forEach((fr, i) => {
          const prev = frames[i - 1];
          if (prev && !(prev.onGround && fr.onGround))
            expect(fr.state.friction).toBe(prev.state.friction);
        });
      }),
    );
  });

  it("on the first tick after landing, neither updates the friction estimate nor detects a collision", () => {
    const air = fc.array(driveInput, { minLength: 1, maxLength: 20 });
    const warm = fc.integer({ min: 20, max: 80 });
    fc.assert(
      fc.property(warm, air, mu, (w, a, m) => {
        const ins = [...repeat(FULL_THROTTLE, w), ...a, FULL_THROTTLE];
        const ter = ins.map((_, i) => ({
          onGround: i < w || i === ins.length - 1,
          step: false,
        }));
        const frames = simulate(ins, { mu: m }, 0, ter);
        const [before, landing] = frames.slice(-2);
        expect(landing?.state.friction).toBe(before?.state.friction);
        expect(landing?.blocked).toBe(false);
      }),
    );
  });

  it("on flat ground the friction estimate settles on the engine's friction whatever the heading (ADR 0003)", () => {
    const yaw0 = fc.double({ min: -180, max: 180, noNaN: true });
    fc.assert(
      fc.property(yaw0, mu, (y, m) => {
        const frames = simulate(repeat(FULL_THROTTLE, 60), { mu: m }, y);
        expect(frames.at(-1)?.state.friction).toBeCloseTo(m, 9);
      }),
    );
  });

  it("moves the friction estimate frictionEma of the way toward the measured ratio (ADR 0003)", () => {
    const given = { x: 0.5, z: 1 };
    const r = stepMotion(
      { speed: 0.5, yaw: 0, stepTicks: 0, friction: 0.7, expected: given },
      FULL_THROTTLE,
      { velocity: { x: given.x * 0.6, z: given.z * 0.6 }, onGround: true },
      () => 0,
      SUV_MOTION,
    );
    expect(r.blocked).toBe(false);
    expect(r.state.friction).toBeCloseTo(
      (1 - MOTION.frictionEma) * 0.7 + MOTION.frictionEma * 0.6,
      12,
    );
  });

  it("the step countdown stays between 0 and stepTicks - 1", () => {
    fc.assert(
      fc.property(inputs, mu, terrain, (ins, m, ter) => {
        for (const fr of simulate(ins, { mu: m }, 0, ter)) {
          expect(fr.state.stepTicks).toBeGreaterThanOrEqual(0);
          expect(fr.state.stepTicks).toBeLessThan(MOTION.stepTicks);
        }
      }),
    );
  });

  it("never jumps a step without forward throttle, even while creeping or coasting forward (ADR 0018)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: SUV_SPEC.maxSpeed, noNaN: true }),
        fc.boolean(),
        (speed, creep) => {
          const r = stepMotion(
            { speed, yaw: 0, stepTicks: 0 },
            { throttle: 0, steer: 0, handbrake: false, creep },
            { velocity: { x: 0, z: 0 }, onGround: true },
            () => 2,
            SUV_MOTION,
          );
          expect(r.jumpVelocity).toBe(0);
        },
      ),
    );
  });

  it("jumps a step when forward throttle brakes the vehicle out of reverse to a standstill", () => {
    const r = stepMotion(
      { speed: -SUV_SPEC.brake, yaw: 0, stepTicks: 0 },
      FULL_THROTTLE,
      { velocity: { x: 0, z: 0 }, onGround: true },
      () => 2,
      SUV_MOTION,
    );
    expect(r.jumpVelocity).toBe(MOTION.stepVelocity);
    expect(r.state.speed).toBe(MOTION.stepMinSpeed);
  });

  it("in the air without a step jump, applies only airControl of the correction toward the target", () => {
    const vel = fc.record({
      x: fc.double({ min: -1, max: 1, noNaN: true }),
      z: fc.double({ min: -1, max: 1, noNaN: true }),
    });
    const prev = fc.record({
      speed: fc.double({
        min: -SUV_SPEC.maxReverse,
        max: SUV_SPEC.maxSpeed,
        noNaN: true,
      }),
      yaw: fc.double({ min: -180, max: 180, noNaN: true }),
      friction: fc.option(fc.double({ min: 0.5, max: 1, noNaN: true }), {
        nil: undefined,
      }),
      expected: fc.option(vel, { nil: undefined }),
      stepTicks: fc.constant(0),
    });
    fc.assert(
      fc.property(prev, driveInput, vel, (p, input, v) => {
        const r = stepMotion(
          p,
          input,
          { velocity: v, onGround: false },
          () => 2,
          SUV_MOTION,
        );
        expect(r.jumpVelocity).toBe(0);
        expect(r.blocked).toBe(false);
        expect(r.state.friction).toBe(p.friction);
        const f = r.forward;
        const vLong = dot(v, f);
        const keepLat =
          1 - (input.handbrake ? SUV_SPEC.handbrakeGrip : SUV_SPEC.grip);
        const target = clampLength(
          {
            x: f.x * r.state.speed + (v.x - f.x * vLong) * keepLat,
            z: f.z * r.state.speed + (v.z - f.z * vLong) * keepLat,
          },
          SUV_SPEC.maxSpeed,
        );
        expect(r.impulse.x).toBeCloseTo(
          MOTION.airControl * (target.x / MOTION.airFriction - v.x),
          9,
        );
        expect(r.impulse.z).toBeCloseTo(
          MOTION.airControl * (target.z / MOTION.airFriction - v.z),
          9,
        );
      }),
    );
  });

  it("jumps up a step only on the ground with forward throttle and non-negative speed", () => {
    const prev = fc.record({
      speed: fc.double({
        min: -SUV_SPEC.maxReverse,
        max: SUV_SPEC.maxSpeed,
        noNaN: true,
      }),
      yaw: fc.double({ min: -180, max: 180, noNaN: true }),
      stepTicks: fc.constant(0),
    });
    fc.assert(
      fc.property(prev, driveInput, fc.boolean(), (p, input, onGround) => {
        const r = stepMotion(
          p,
          input,
          { velocity: { x: 0, z: 0 }, onGround },
          () => 2,
          SUV_MOTION,
        );
        const speed = updateSpeed(
          p.speed,
          input.throttle,
          input.creep,
          SUV_MOTION,
        );
        expect(r.jumpVelocity > 0).toBe(
          onGround && input.throttle > 0 && speed >= 0,
        );
      }),
    );
  });

  it("drops all sideways velocity while climbing a step", () => {
    const climb = fc.array(driveInput, {
      minLength: MOTION.stepTicks,
      maxLength: MOTION.stepTicks,
    });
    fc.assert(
      fc.property(forwardInputs, climb, mu, (warm, up, m) => {
        const jump = { ...FULL_THROTTLE, steer: 0 };
        const ter: Terrain[] = [
          ...warm.map(() => FLAT),
          { onGround: true, step: true },
          ...up.slice(1).map(() => ({ onGround: false, step: false })),
        ];
        const frames = simulate(
          [...warm, jump, ...up.slice(1)],
          { mu: m },
          0,
          ter,
        );
        const climbing = frames.slice(warm.length);
        expect(climbing[0]?.jumpVelocity).toBe(MOTION.stepVelocity);
        for (const fr of climbing)
          expect(lateral(fr.body.vel, fr.state.yaw)).toBeLessThan(1e-9);
      }),
    );
  });

  it("sideways velocity decreases without increasing after input stops", () => {
    const quiet = repeat(NEUTRAL_INPUT, 60);
    fc.assert(
      fc.property(inputs, mu, (warm, m) => {
        const frames = simulate([...warm, ...quiet], { mu: m });
        let previous = Number.POSITIVE_INFINITY;
        for (const fr of frames.slice(warm.length)) {
          const current = lateral(fr.body.vel, fr.state.yaw);
          expect(current).toBeLessThanOrEqual(previous + 1e-9);
          previous = current;
        }
      }),
    );
  });

  it("stops when hitting a wall at an angle, with speed along the wall no greater than the along-wall component just before impact", () => {
    const yaw0 = fc.double({ min: -130, max: -50, noNaN: true }); // Faces roughly toward +x (the wall)
    const wallX = fc.double({ min: 8, max: 20, noNaN: true });
    fc.assert(
      fc.property(yaw0, wallX, mu, (y, w, m) => {
        const frames = simulate(
          repeat(FULL_THROTTLE, 200),
          { mu: m, wallX: w },
          y,
        );
        const first = frames.findIndex((f) => f.touching);
        expect(first).toBeGreaterThan(0);
        const before = Math.abs(
          defined(frames[first - 1], "frame before impact").body.vel.z,
        );
        for (const f of frames.slice(first)) {
          expect(Math.abs(f.body.vel.z)).toBeLessThanOrEqual(before + 0.05);
        }
        expect(frames.slice(first + 2).some((f) => f.blocked)).toBe(true);
      }),
    );
  });

  it("slides sideways more under the handbrake than during normal driving", () => {
    const run = (hb: boolean) => {
      const accel = repeat(FULL_THROTTLE, 60);
      const turn = repeat(
        { throttle: 1, steer: 1, handbrake: hb, creep: false },
        20,
      );
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
      FULL_THROTTLE,
      { velocity: { x: 0, z: 0 }, onGround: true },
      () => 2,
      SUV_MOTION,
    );
    expect(r.jumpVelocity).toBe(MOTION.stepVelocity);
    expect(r.state.speed).toBeGreaterThanOrEqual(MOTION.stepMinSpeed);
    expect(r.state.stepTicks).toBe(MOTION.stepTicks - 1);
  });

  it("jumps a one-block step with the lower velocity (ADR 0035)", () => {
    const r = stepMotion(
      initialMotion(0),
      FULL_THROTTLE,
      { velocity: { x: 0, z: 0 }, onGround: true },
      () => 1,
      SUV_MOTION,
    );
    expect(r.jumpVelocity).toBe(MOTION.oneStepVelocity);
    expect(r.state.speed).toBeGreaterThanOrEqual(MOTION.stepMinSpeed);
  });
});
