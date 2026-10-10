// tests/domain/stepUp.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SPEC } from "../../src/domain/vehicle/spec";
import { type SolidAt, shouldStepUp, STEP_LANES } from "../../src/domain/vehicle/stepUp";

interface Lane { start: number; height: number; ceiling?: number }

/** 3 本の線それぞれに、start から先が height の高さでふさがった地形。ceiling 以上の高さもふさがる。 */
function terrain(lanes: (Lane | undefined)[], overhead = false): SolidAt {
  return (ahead, side, dy) => {
    if (ahead === 0 && side === 0) return overhead && dy >= 2;
    const lane = lanes[STEP_LANES.indexOf(side)];
    if (!lane || ahead < lane.start) return false;
    if (dy < lane.height) return true;
    return lane.ceiling !== undefined && dy >= lane.ceiling;
  };
}

const speed = fc.double({ min: 0, max: SPEC.maxSpeed, noNaN: true });
const lookahead = (s: number) => s * SPEC.stepLookaheadTicks + SPEC.stepLookaheadMargin;
const startIn = (s: number) => fc.double({ min: SPEC.hitboxFront + 0.1, max: SPEC.hitboxFront + lookahead(s) - 0.2, noNaN: true });
const laneIndex = fc.integer({ min: 0, max: 2 });

describe("shouldStepUp (ADR 0004)", () => {
  it("先読みの範囲にある高さ 2 の段差には跳ぶ (どの線でも)", () => {
    fc.assert(fc.property(speed.chain((s) => fc.tuple(fc.constant(s), startIn(s))), laneIndex, ([s, start], i) => {
      const lanes: (Lane | undefined)[] = [undefined, undefined, undefined];
      lanes[i] = { start, height: 2 };
      expect(shouldStepUp(terrain(lanes), s)).toBe(true);
    }));
  });

  it("高さ 3 以上の障害物しかなければ跳ばない", () => {
    const lane = fc.option(fc.record({ start: fc.double({ min: 1, max: 5, noNaN: true }), height: fc.integer({ min: 3, max: 6 }) }), { nil: undefined });
    fc.assert(fc.property(fc.tuple(lane, lane, lane), speed, (lanes, s) => {
      expect(shouldStepUp(terrain(lanes), s)).toBe(false);
    }));
  });

  it("高さ 2 の段差より手前か同じ距離に、別の線で高さ 3 以上があれば跳ばない", () => {
    fc.assert(fc.property(
      speed.chain((s) => fc.tuple(fc.constant(s), startIn(s))),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.integer({ min: 3, max: 6 }),
      laneIndex,
      laneIndex,
      ([s, stepStart], frac, wallH, a, b) => {
        fc.pre(a !== b);
        const lanes: (Lane | undefined)[] = [undefined, undefined, undefined];
        lanes[a] = { start: stepStart, height: 2 };
        lanes[b] = { start: SPEC.hitboxFront + 0.1 + (stepStart - SPEC.hitboxFront - 0.1) * frac, height: wallH };
        expect(shouldStepUp(terrain(lanes), s)).toBe(false);
      },
    ));
  });

  it("高さ 2 の段差の上に車が入る空間 (1.6) がなければ跳ばない", () => {
    fc.assert(fc.property(speed.chain((s) => fc.tuple(fc.constant(s), startIn(s))), fc.double({ min: 2, max: 3.5, noNaN: true }), ([s, start], ceiling) => {
      expect(shouldStepUp(terrain([{ start, height: 2, ceiling }]), s)).toBe(false);
    }));
  });

  it("頭上がふさがっていれば跳ばない", () => {
    expect(shouldStepUp(terrain([{ start: SPEC.hitboxFront + 0.2, height: 2 }], true), 0.5)).toBe(false);
  });

  it("高さ 1 の段差だけならエンジンに任せて跳ばない", () => {
    expect(shouldStepUp(terrain([{ start: SPEC.hitboxFront + 0.2, height: 1 }]), 0.5)).toBe(false);
  });

  it("先読みの範囲より遠い段差にはまだ跳ばない", () => {
    expect(shouldStepUp(terrain([{ start: SPEC.hitboxFront + lookahead(0.2) + 0.5, height: 2 }]), 0.2)).toBe(false);
  });
});
