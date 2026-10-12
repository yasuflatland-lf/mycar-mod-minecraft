import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  EMPTY_COUNTER,
  type HitCounter,
  registerHit,
} from "../../../src/domain/vehicle/hitCounter";
import { SPEC } from "../../../src/domain/vehicle/spec";

const hits = fc.array(
  fc.record({
    gap: fc.integer({ min: 0, max: SPEC.hitResetTicks * 2 }),
    hasRiders: fc.boolean(),
  }),
  { maxLength: 60 },
);

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

  it("ignores ridden hits and breaks exactly on the 3rd unridden hit within the reset window", () => {
    fc.assert(
      fc.property(hits, (events) => {
        let c: HitCounter = EMPTY_COUNTER;
        let tick = 0;
        let streak = 0;
        let lastUnridden = Number.NEGATIVE_INFINITY;
        for (const { gap, hasRiders } of events) {
          tick += gap;
          const r = registerHit(c, tick, hasRiders);
          if (hasRiders) {
            expect(r.broken).toBe(false);
            expect(r.counter).toEqual(c);
          } else {
            streak = tick - lastUnridden <= SPEC.hitResetTicks ? streak + 1 : 1;
            lastUnridden = tick;
            const shouldBreak = streak >= SPEC.hitsToBreak;
            expect(r.broken).toBe(shouldBreak);
            if (shouldBreak) {
              streak = 0;
              lastUnridden = Number.NEGATIVE_INFINITY;
            }
          }
          c = r.counter;
        }
      }),
    );
  });

  it("keeps the count when the gap is exactly the reset window", () => {
    let c = registerHit(EMPTY_COUNTER, 0, false).counter;
    c = registerHit(c, 10, false).counter;
    const r = registerHit(c, 10 + SPEC.hitResetTicks, false);
    expect(r.broken).toBe(true);
  });

  it("resets the count to 0 when not hit for more than the reset window", () => {
    let c = registerHit(EMPTY_COUNTER, 0, false).counter;
    c = registerHit(c, 10, false).counter;
    const r = registerHit(c, 10 + SPEC.hitResetTicks + 1, false);
    expect(r.broken).toBe(false);
    expect(r.counter.count).toBe(1);
  });
});
