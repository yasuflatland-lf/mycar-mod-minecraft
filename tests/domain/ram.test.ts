// tests/domain/ram.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward, rightOf } from "../../src/domain/shared/vec";
import { type RamTarget, ramDamage, selectHits } from "../../src/domain/vehicle/ram";
import { SPEC } from "../../src/domain/vehicle/spec";

const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const fastSpeed = fc.double({ min: SPEC.ramMinSpeed + 0.001, max: SPEC.maxSpeed, noNaN: true });

function at(yawDeg: number, ahead: number, side: number, dy = 0, protectedOccupant = false): RamTarget {
  const f = forward(yawDeg);
  const r = rightOf(f);
  return { id: "t", offset: { x: f.x * ahead + r.x * side, y: dy, z: f.z * ahead + r.z * side }, protectedOccupant };
}

describe("ramDamage (ADR 0006)", () => {
  it("速度について単調非減少で、ram が起きる速度では 1 以上", () => {
    fc.assert(fc.property(fastSpeed, fastSpeed, (a, b) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      expect(ramDamage(lo)).toBeLessThanOrEqual(ramDamage(hi));
      expect(ramDamage(lo)).toBeGreaterThanOrEqual(1);
    }));
  });

  it("最高速度で 18", () => {
    expect(ramDamage(SPEC.maxSpeed)).toBe(18);
  });
});

describe("selectHits (ADR 0006)", () => {
  const reach = SPEC.bodyFront + SPEC.targetHalfWidth;

  it("前方の判定範囲にいる相手には当たり、進行方向へ押し出す", () => {
    // 境界ちょうどの相手は forward と rightOf の丸め誤差で範囲の外になりうるので、両端から少し内側だけを生成する
    const inside = fc.double({ min: 1e-6, max: reach - 1e-6, noNaN: true });
    fc.assert(fc.property(yaw, fastSpeed, inside, fc.double({ min: -1.4, max: 1.4, noNaN: true }), (y, s, ahead, side) => {
      const hits = selectHits(forward(y), s, [at(y, ahead, side)], new Map(), 0);
      expect(hits).toHaveLength(1);
      const f = forward(y);
      expect(hits[0]!.push.x * f.x + hits[0]!.push.z * f.z).toBeGreaterThan(0);
    }));
  });

  it("後ろや判定範囲の外の相手には当たらない", () => {
    const outside = fc.oneof(fc.double({ min: -3, max: -0.01, noNaN: true }), fc.double({ min: reach + 0.01, max: 3, noNaN: true }));
    fc.assert(fc.property(yaw, fastSpeed, outside, (y, s, ahead) => {
      expect(selectHits(forward(y), s, [at(y, ahead, 0)], new Map(), 0)).toHaveLength(0);
    }));
  });

  it("後退中は後ろの相手に当たる", () => {
    expect(selectHits(forward(0), -0.2, [at(0, -1, 0)], new Map(), 0)).toHaveLength(1);
  });

  it("守られた乗員 (どの車の乗員でも) には当てない", () => {
    fc.assert(fc.property(yaw, fastSpeed, fc.double({ min: 0, max: reach, noNaN: true }), (y, s, ahead) => {
      expect(selectHits(forward(y), s, [at(y, ahead, 0, 0, true)], new Map(), 0)).toHaveLength(0);
    }));
  });

  it("同じ相手には 10 tick 以内に続けて当てない", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: SPEC.ramCooldown - 1 }), (dt) => {
      expect(selectHits(forward(0), 0.5, [at(0, 1, 0)], new Map([["t", 100]]), 100 + dt)).toHaveLength(0);
    }));
    expect(selectHits(forward(0), 0.5, [at(0, 1, 0)], new Map([["t", 100]]), 100 + SPEC.ramCooldown)).toHaveLength(1);
  });

  it("速度 0.15 以下では当てない", () => {
    expect(selectHits(forward(0), SPEC.ramMinSpeed, [at(0, 1, 0)], new Map(), 0)).toHaveLength(0);
  });
});
