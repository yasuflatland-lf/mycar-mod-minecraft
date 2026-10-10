// tests/domain/hitCounter.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  EMPTY_COUNTER,
  registerHit,
} from "../../src/domain/vehicle/hitCounter";
import { SPEC } from "../../src/domain/vehicle/spec";

describe("registerHit (ADR 0008)", () => {
  it("breaks after 3 hits in quick succession", () => {
    let c = EMPTY_COUNTER;
    const results = [0, 10, 20].map((t) => {
      const r = registerHit(c, t, false);
      c = r.counter;
      return r.broken;
    });
    expect(results).toEqual([false, false, true]);
  });

  it("never breaks while there are occupants, no matter how many hits", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1000 }), { maxLength: 50 }),
        (ticks) => {
          let c = EMPTY_COUNTER;
          for (const t of [...ticks].sort((a, b) => a - b)) {
            const r = registerHit(c, t, true);
            expect(r.broken).toBe(false);
            c = r.counter;
          }
        },
      ),
    );
  });

  it("resets the count to 0 when not hit for more than 100 ticks", () => {
    let c = registerHit(EMPTY_COUNTER, 0, false).counter;
    c = registerHit(c, 10, false).counter;
    const r = registerHit(c, 10 + SPEC.hitResetTicks + 1, false);
    expect(r.broken).toBe(false);
    expect(r.counter.count).toBe(1);
  });
});
