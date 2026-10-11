import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  hitTick,
  judgeRam,
  MIN_PUSH,
  PUSH_WINDOW,
  type RamSample,
} from "../../src/test-pack/ramJudge";

const hp0 = fc.integer({ min: 2, max: 40 });
const x = fc.double({ min: 1, max: 30, noNaN: true });
const lead = fc.nat({ max: 50 });

/** The cow stays at full health for `before` ticks, then is hit, then the knockback moves it by `push`. */
function rammed(
  hp: number,
  g: number,
  before: number,
  push: number,
): RamSample[] {
  const idle = Array.from({ length: before }, () => ({
    valid: true,
    hp,
    x: g,
  }));
  const after = Array.from({ length: PUSH_WINDOW + 1 }, (_, i) => ({
    valid: true,
    hp: hp - 1,
    x: g + (push * i) / PUSH_WINDOW,
  }));
  return [...idle, ...after];
}

describe("judgeRam", () => {
  it("passes a hit whose knockback moves the cow by more than MIN_PUSH", () => {
    fc.assert(
      fc.property(
        hp0,
        x,
        lead,
        fc.double({ min: MIN_PUSH + 0.01, max: 10, noNaN: true }),
        (hp, g, before, push) => {
          expect(judgeRam(hp, g, rammed(hp, g, before, push)).pass).toBe(true);
        },
      ),
    );
  });

  it("fails a hit that does not push the cow away from the car", () => {
    fc.assert(
      fc.property(
        hp0,
        x,
        lead,
        // Keep a margin below MIN_PUSH: at exactly MIN_PUSH, (g + push) - g can
        // round to just above it and pass.
        fc.double({ min: -5, max: MIN_PUSH - 0.01, noNaN: true }),
        (hp, g, before, push) => {
          expect(judgeRam(hp, g, rammed(hp, g, before, push)).pass).toBe(false);
        },
      ),
    );
  });

  it("does not count a cow that vanished without losing health as hit", () => {
    fc.assert(
      fc.property(hp0, x, lead, (hp, g, before) => {
        const samples = rammed(hp, g, before, 5).map((s, i) =>
          i < before ? s : { valid: false, hp: 0, x: Number.NaN },
        );
        expect(hitTick(hp, samples)).toBe(-1);
        expect(judgeRam(hp, g, samples).pass).toBe(false);
      }),
    );
  });

  it("fails when the cow is gone before the push can be measured", () => {
    fc.assert(
      fc.property(
        hp0,
        x,
        lead,
        fc.integer({ min: 1, max: PUSH_WINDOW }),
        (hp, g, before, gone) => {
          // A stale position on an invalid sample must not count as a push.
          const samples = rammed(hp, g, before, 5).map((s, i) =>
            i < before + gone ? s : { ...s, valid: false, x: g + 10 },
          );
          expect(judgeRam(hp, g, samples).pass).toBe(false);
        },
      ),
    );
  });

  it("fails when the cow is never hit", () => {
    fc.assert(
      fc.property(hp0, x, lead, (hp, g, n) => {
        const samples = Array.from({ length: n }, (_, i) => ({
          valid: true,
          hp,
          x: g + i,
        }));
        expect(judgeRam(hp, g, samples).pass).toBe(false);
      }),
    );
  });
});
