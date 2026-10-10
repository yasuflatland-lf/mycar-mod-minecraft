// tests/domain/driveInput.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  NEUTRAL_INPUT,
  toDriveInput,
} from "../../src/domain/vehicle/driveInput";

const axis = fc.double({ min: -1, max: 1, noNaN: true });

describe("toDriveInput (ADR 0005)", () => {
  it("左右または前後が NaN や正負の Infinity ならニュートラル入力になる", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(Number.NaN, Infinity, -Infinity),
        fc.double(),
        fc.boolean(),
        (invalid, other, jump) => {
          expect(toDriveInput({ moveX: invalid, moveY: other, jump })).toEqual(
            NEUTRAL_INPUT,
          );
          expect(toDriveInput({ moveX: other, moveY: invalid, jump })).toEqual(
            NEUTRAL_INPUT,
          );
        },
      ),
    );
  });

  it("throttle is 0 when the absolute forward/backward input is at most 0.1", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -0.1, max: 0.1, noNaN: true }),
        axis,
        (y, x) => {
          expect(
            toDriveInput({ moveX: x, moveY: y, jump: false }).throttle,
          ).toBe(0);
        },
      ),
    );
  });

  it("throttle is full when the absolute forward/backward input is at least 0.5 (preserving the input sign)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 1, noNaN: true }),
        fc.boolean(),
        (a, neg) => {
          const y = neg ? -a : a;
          expect(
            toDriveInput({ moveX: 0, moveY: y, jump: false }).throttle,
          ).toBe(neg ? -1 : 1);
        },
      ),
    );
  });

  it("throttle is monotonically nondecreasing with forward/backward input", () => {
    fc.assert(
      fc.property(axis, axis, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(
          toDriveInput({ moveX: 0, moveY: lo, jump: false }).throttle,
        ).toBeLessThanOrEqual(
          toDriveInput({ moveX: 0, moveY: hi, jump: false }).throttle,
        );
      }),
    );
  });

  it("throttle is full even with sharp steering on mobile when pushed at least halfway forward (measurements from the spike)", () => {
    expect(
      toDriveInput({ moveX: 0.9, moveY: 0.48, jump: false }).throttle,
    ).toBeCloseTo(0.96);
    expect(
      toDriveInput({ moveX: 0.81, moveY: 0.54, jump: false }).throttle,
    ).toBe(1);
  });

  it("left/right input maps directly to steering, and jump maps to the handbrake", () => {
    fc.assert(
      fc.property(axis, fc.boolean(), (x, jump) => {
        const d = toDriveInput({ moveX: x, moveY: 0, jump });
        expect(d.steer).toBe(x);
        expect(d.handbrake).toBe(jump);
      }),
    );
  });
});
