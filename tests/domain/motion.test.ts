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
  it("全開で約 40 tick で最高速度の 95% に達する", () => {
    let s = 0;
    let t = 0;
    while (s < SPEC.maxSpeed * 0.95) {
      s = updateSpeed(s, 1);
      t++;
    }
    expect(t).toBeGreaterThanOrEqual(35);
    expect(t).toBeLessThanOrEqual(42);
  });

  it("入力なしなら惰性で止まり、符号は反転しない", () => {
    let s: number = SPEC.maxSpeed;
    for (let i = 0; i < 100; i++) s = updateSpeed(s, 0);
    expect(s).toBe(0);
  });

  it("停止中はハンドルを切っても向きが変わらない。後退中は逆に曲がる", () => {
    expect(steerYaw(10, 0, 1)).toBe(10);
    expect(steerYaw(10, 0.5, 1)).toBeLessThan(10);
    expect(steerYaw(10, -0.1, 1)).toBeGreaterThan(10);
  });

  it("向きはどれだけ回っても (-180, 180] に収まる", () => {
    let yaw = 0;
    for (let i = 0; i < 10_000; i++) yaw = steerYaw(yaw, SPEC.maxSpeed, 1);
    expect(yaw).toBeGreaterThan(-180);
    expect(yaw).toBeLessThanOrEqual(180);
  });
});

describe("stepMotion (性質, ADR 0002/0003)", () => {
  it("地上の水平速度は最高速度を超えない (立ち上がりの 30 tick は推定の誤差で 10% まで)", () => {
    fc.assert(
      fc.property(inputs, mu, (ins, m) => {
        simulate(ins, { mu: m }).forEach((fr, i) => {
          const limit = SPEC.maxSpeed * (i < 30 ? 1.1 : 1.02);
          expect(length(fr.body.vel)).toBeLessThanOrEqual(limit + 1e-9);
        });
      }),
    );
  });

  it("内部の速度は、壁に当たっても後退の上限から最高速度の範囲に収まる", () => {
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

  it("壁のない地面では衝突中と判定しない", () => {
    fc.assert(
      fc.property(inputs, mu, (ins, m) => {
        for (const fr of simulate(ins, { mu: m }))
          expect(fr.state.blocked).toBe(false);
      }),
    );
  });

  it("入力をやめると、横滑りの速度は増えずに減っていく", () => {
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

  it("壁に斜めに当たったら止まり、壁沿いの速度は当たる直前の壁沿いの成分を超えない", () => {
    const yaw0 = fc.double({ min: -130, max: -50, noNaN: true }); // おおむね +x (壁) を向く
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

  it("ハンドブレーキ中は通常より大きく横滑りする", () => {
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

  it("段差で跳ぶと、上向きに跳んだことを返し、内部の速度を下限まで上げる", () => {
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
