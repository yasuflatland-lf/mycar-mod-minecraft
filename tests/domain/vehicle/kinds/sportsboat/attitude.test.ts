import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  SPORTSBOAT_ATTITUDE,
  stepRoll,
  stepTrim,
} from "../../../../../src/domain/vehicle/kinds/sportsboat/attitude";
import { SPORTSBOAT_MOTION } from "../../../../../src/domain/vehicle/kinds/sportsboat/profile";

const { maxTrim, maxRoll, trimRiseRate, trimSettleRate, rollRate } =
  SPORTSBOAT_ATTITUDE;
const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const trim = number(0, maxTrim);
const roll = number(-maxRoll, maxRoll);
const speed = number(-SPORTSBOAT_MOTION.maxSpeed, SPORTSBOAT_MOTION.maxSpeed);
const yaw = number(-180, 180);
const turn = number(-3, 3).map((t) => t * SPORTSBOAT_MOTION.turnRate);

describe("stepTrim (ADR 0059)", () => {
  it("rises at most trimRiseRate, settles at most trimSettleRate per tick, and stays within 0 and maxTrim", () => {
    fc.assert(
      fc.property(trim, speed, speed, fc.boolean(), (prev, a, b, afloat) => {
        const next = stepTrim(prev, a, b, afloat);
        expect(next - prev).toBeLessThanOrEqual(trimRiseRate + 1e-9);
        expect(prev - next).toBeLessThanOrEqual(trimSettleRate + 1e-9);
        expect(next).toBeGreaterThanOrEqual(-1e-9);
        expect(next).toBeLessThanOrEqual(maxTrim + 1e-9);
      }),
    );
  });

  it("settles at maxTrim while afloat and gaining a full accel per tick", () => {
    let t = 0;
    for (let i = 0; i < 30; i++)
      t = stepTrim(t, 0.2, 0.2 + SPORTSBOAT_MOTION.accel, true);
    expect(t).toBeCloseTo(maxTrim, 9);
  });

  it("never rises while holding speed, slowing, reversing, or aground", () => {
    fc.assert(
      fc.property(trim, speed, number(0, 0.1), (prev, s, loss) => {
        expect(stepTrim(prev, s, s - loss, true)).toBeLessThanOrEqual(prev);
        expect(stepTrim(prev, -0.1, -0.2, true)).toBeLessThanOrEqual(prev);
        expect(stepTrim(prev, s, s + loss, false)).toBeLessThanOrEqual(prev);
      }),
    );
  });
});

describe("stepRoll (ADR 0059)", () => {
  it("moves at most rollRate per tick and stays within maxRoll", () => {
    fc.assert(
      fc.property(roll, yaw, turn, speed, fc.boolean(), (prev, y, d, s, a) => {
        const next = stepRoll(prev, y, y + d, s, a);
        expect(Math.abs(next - prev)).toBeLessThanOrEqual(rollRate + 1e-9);
        expect(Math.abs(next)).toBeLessThanOrEqual(maxRoll + 1e-9);
      }),
    );
  });

  it("afloat and moving, lowers the right side when the heading turns right (yaw increases) and the left when it turns left", () => {
    fc.assert(
      fc.property(yaw, number(0.1, 6), number(0.1, 1.12), (y, d, s) => {
        expect(stepRoll(0, y, y + d, s, true)).toBeGreaterThan(0);
        expect(stepRoll(0, y, y - d, s, true)).toBeLessThan(0);
      }),
    );
  });

  it("measures the turn across the ±180° wrap", () => {
    expect(stepRoll(0, 178, -178, 1, true)).toBeGreaterThan(0);
    expect(stepRoll(0, -178, 178, 1, true)).toBeLessThan(0);
  });

  it("rolls less at lower speed for the same turn, and stays level at rest or aground", () => {
    const settle = (s: number, afloat: boolean) => {
      let r = 0;
      for (let i = 0; i < 30; i++)
        r = stepRoll(r, 0, SPORTSBOAT_MOTION.turnRate, s, afloat);
      return r;
    };
    expect(settle(SPORTSBOAT_MOTION.maxSpeed, true)).toBe(maxRoll);
    expect(settle(SPORTSBOAT_MOTION.maxSpeed / 2, true)).toBeCloseTo(
      maxRoll / 2,
      9,
    );
    expect(settle(0, true)).toBe(0);
    expect(settle(SPORTSBOAT_MOTION.maxSpeed, false)).toBe(0);
  });
});
