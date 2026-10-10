// tests/domain/hitCounter.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EMPTY_COUNTER, registerHit } from "../../src/domain/vehicle/hitCounter";
import { SPEC } from "../../src/domain/vehicle/spec";

describe("registerHit (ADR 0008)", () => {
  it("短い間隔で 3 回殴ると壊れる", () => {
    let c = EMPTY_COUNTER;
    const results = [0, 10, 20].map((t) => {
      const r = registerHit(c, t, false);
      c = r.counter;
      return r.broken;
    });
    expect(results).toEqual([false, false, true]);
  });

  it("乗員がいる間は何回殴っても壊れない", () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 1000 }), { maxLength: 50 }), (ticks) => {
      let c = EMPTY_COUNTER;
      for (const t of [...ticks].sort((a, b) => a - b)) {
        const r = registerHit(c, t, true);
        expect(r.broken).toBe(false);
        c = r.counter;
      }
    }));
  });

  it("100 tick より長く殴られなければ、回数は 0 に戻る", () => {
    let c = registerHit(EMPTY_COUNTER, 0, false).counter;
    c = registerHit(c, 10, false).counter;
    const r = registerHit(c, 10 + SPEC.hitResetTicks + 1, false);
    expect(r.broken).toBe(false);
    expect(r.counter.count).toBe(1);
  });
});
