import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SPEC } from "../../src/domain/vehicle/spec";
import {
  type SolidAt,
  STEP_LANES,
  stepHeight,
} from "../../src/domain/vehicle/stepUp";

interface Lane {
  start: number;
  height: number;
  ceiling?: number;
}

/**
 * Terrain where each of the 3 rays is blocked up to `height` from `start`
 * onward. Heights at or above `ceiling` are also blocked.
 */
function terrain(lanes: (Lane | undefined)[], overhead = false): SolidAt {
  return (ahead, side, dy) => {
    if (ahead === 0 && side === 0) return overhead && dy >= 2;
    const lane = lanes[STEP_LANES.indexOf(side)];
    if (!lane || ahead < lane.start) return false;
    if (dy < lane.height) return true;
    return lane.ceiling !== undefined && dy >= lane.ceiling;
  };
}

const scanStart = SPEC.hitboxFront + 0.1;
const speed = fc.double({ min: 0, max: SPEC.maxSpeed, noNaN: true });
const lookahead = (s: number) =>
  s * SPEC.stepLookaheadTicks + SPEC.stepLookaheadMargin;
const startIn = (s: number) =>
  fc.double({
    min: scanStart,
    max: SPEC.hitboxFront + lookahead(s) - 0.2,
    noNaN: true,
  });
const laneIndex = fc.integer({ min: 0, max: 2 });

describe("stepHeight (ADR 0004, 0034)", () => {
  it("jumps for a step of height 2 within look-ahead range (on any ray)", () => {
    fc.assert(
      fc.property(
        speed.chain((s) => fc.tuple(fc.constant(s), startIn(s))),
        laneIndex,
        ([s, start], i) => {
          const lanes: (Lane | undefined)[] = [undefined, undefined, undefined];
          lanes[i] = { start, height: 2 };
          expect(stepHeight(terrain(lanes), s)).toBe(2);
        },
      ),
    );
  });

  it("does not jump when all obstacles have a height of 3 or more", () => {
    const lane = fc.option(
      fc.record({
        start: fc.double({ min: 1, max: 5, noNaN: true }),
        height: fc.integer({ min: 3, max: 6 }),
      }),
      { nil: undefined },
    );
    fc.assert(
      fc.property(fc.tuple(lane, lane, lane), speed, (lanes, s) => {
        expect(stepHeight(terrain(lanes), s)).toBe(0);
      }),
    );
  });

  it("does not jump if another ray has an obstacle of height 3 or more closer than or at the same distance as a step of height 2", () => {
    fc.assert(
      fc.property(
        speed.chain((s) => fc.tuple(fc.constant(s), startIn(s))),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 3, max: 6 }),
        laneIndex,
        laneIndex,
        ([s, stepStart], frac, wallH, a, b) => {
          fc.pre(a !== b);
          const lanes: (Lane | undefined)[] = [undefined, undefined, undefined];
          lanes[a] = { start: stepStart, height: 2 };
          lanes[b] = {
            start: scanStart + (stepStart - scanStart) * frac,
            height: wallH,
          };
          expect(stepHeight(terrain(lanes), s)).toBe(0);
        },
      ),
    );
  });

  // Terrain is made of whole blocks, so a ceiling starts at an integer height.
  const stepTop = 2;
  const firstFreeCeiling = Math.ceil(stepTop + SPEC.carHeight);

  it("does not jump if there is no room (SPEC.carHeight) for the vehicle above a step of height 2", () => {
    fc.assert(
      fc.property(
        speed.chain((s) => fc.tuple(fc.constant(s), startIn(s))),
        fc.integer({ min: stepTop, max: firstFreeCeiling - 1 }),
        ([s, start], ceiling) => {
          expect(stepHeight(terrain([{ start, height: 2, ceiling }]), s)).toBe(
            0,
          );
        },
      ),
    );
  });

  it("jumps onto a step of height 2 when the ceiling leaves room for SPEC.carHeight", () => {
    fc.assert(
      fc.property(
        speed.chain((s) => fc.tuple(fc.constant(s), startIn(s))),
        fc.integer({ min: firstFreeCeiling, max: firstFreeCeiling + 3 }),
        ([s, start], ceiling) => {
          expect(stepHeight(terrain([{ start, height: 2, ceiling }]), s)).toBe(
            2,
          );
        },
      ),
    );
  });

  it("does not jump if blocked overhead", () => {
    expect(
      stepHeight(
        terrain([{ start: SPEC.hitboxFront + 0.2, height: 2 }], true),
        0.5,
      ),
    ).toBe(0);
  });

  it("jumps a height-1 step within look-ahead range, which a controlling rider keeps the engine from stepping (ADR 0034)", () => {
    fc.assert(
      fc.property(
        speed.chain((s) => fc.tuple(fc.constant(s), startIn(s))),
        laneIndex,
        ([s, start], i) => {
          const lanes: (Lane | undefined)[] = [undefined, undefined, undefined];
          lanes[i] = { start, height: 1 };
          expect(stepHeight(terrain(lanes), s)).toBe(1);
        },
      ),
    );
  });

  it("jumps the higher step when rays at the same distance find heights 1 and 2", () => {
    const start = SPEC.hitboxFront + 0.2;
    expect(
      stepHeight(
        terrain([
          { start, height: 1 },
          { start, height: 2 },
        ]),
        0.5,
      ),
    ).toBe(2);
  });

  it("does not jump a height-1 step without room (SPEC.carHeight) above it, but does with the room", () => {
    const start = SPEC.hitboxFront + 0.2;
    const ceilingFor = (c: number) =>
      terrain([{ start, height: 1, ceiling: c }]);
    expect(stepHeight(ceilingFor(2), 0.5)).toBe(0);
    expect(stepHeight(ceilingFor(Math.ceil(1 + SPEC.carHeight)), 0.5)).toBe(1);
  });

  it("does not jump yet for a step beyond look-ahead range", () => {
    expect(
      stepHeight(
        terrain([
          { start: SPEC.hitboxFront + lookahead(0.2) + 0.5, height: 2 },
        ]),
        0.2,
      ),
    ).toBe(0);
  });
});
