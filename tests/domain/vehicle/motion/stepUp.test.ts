import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SUV_SPEC } from "../../../../src/domain/vehicle/kinds/suv/spec";
import { MOTION } from "../../../../src/domain/vehicle/motion/constants";
import {
  stepHeight as probeStepHeight,
  type SolidAt,
  STEP_LANES,
} from "../../../../src/domain/vehicle/motion/stepUp";

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

const scanStart = SUV_SPEC.hitboxFront + 0.1;
const speed = fc.double({ min: 0, max: SUV_SPEC.maxSpeed, noNaN: true });
const lookahead = (s: number) =>
  s * MOTION.stepLookaheadTicks + MOTION.stepLookaheadMargin;
const startIn = (s: number) =>
  fc.double({
    min: scanStart,
    max: SUV_SPEC.hitboxFront + lookahead(s) - 0.2,
    noNaN: true,
  });
const laneIndex = fc.integer({ min: 0, max: 2 });

describe("stepHeight (ADR 0004, 0035)", () => {
  it("moves the scan with the body's front and ignores obstacles behind its scan start", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 4, max: 8, noNaN: true }),
        laneIndex,
        fc.constantFrom(1, 2),
        (front, lane, height) => {
          const lanes = (start: number): (Lane | undefined)[] => {
            const result: (Lane | undefined)[] = [
              undefined,
              undefined,
              undefined,
            ];
            result[lane] = { start, height };
            return result;
          };
          for (const bodyFront of [front, front + 10]) {
            expect(
              probeStepHeight(terrain(lanes(bodyFront + 0.2)), 0.2, {
                front: bodyFront,
                height: 1,
              }),
            ).toBe(height);
            const behind: SolidAt = (ahead, side, dy) =>
              side === STEP_LANES[lane] &&
              ahead >= bodyFront - 0.2 &&
              ahead < bodyFront + 0.05 &&
              dy < height;
            expect(
              probeStepHeight(behind, 0.2, { front: bodyFront, height: 1 }),
            ).toBe(0);
          }
        },
      ),
    );
  });

  it("checks clearance above a step against the body's height", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 1, noNaN: true }),
        fc.double({ min: 2.1, max: 3, noNaN: true }),
        (short, tall) => {
          const solid = terrain([{ start: 4.2, height: 1, ceiling: 2 }]);
          expect(probeStepHeight(solid, 0.2, { front: 4, height: short })).toBe(
            1,
          );
          expect(probeStepHeight(solid, 0.2, { front: 4, height: tall })).toBe(
            0,
          );
        },
      ),
    );
  });

  it("checks overhead at the ceiling of the body's height", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 1, noNaN: true }),
        fc.double({ min: 2.1, max: 3, noNaN: true }),
        (short, tall) => {
          const step = terrain([{ start: 4.2, height: 1 }]);
          for (const height of [short, tall]) {
            const overhead = Math.ceil(height) + 0.5;
            const solid: SolidAt = (ahead, side, dy) =>
              ahead === 0 && side === 0
                ? dy === overhead
                : step(ahead, side, dy);
            expect(probeStepHeight(solid, 0.2, { front: 4, height })).toBe(0);
            expect(
              probeStepHeight(solid, 0.2, {
                front: 4,
                height: height === short ? tall : short,
              }),
            ).toBe(1);
          }
        },
      ),
    );
  });

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
  const firstFreeCeiling = Math.ceil(stepTop + SUV_SPEC.carHeight);

  it("does not jump if there is no room (SUV_SPEC.carHeight) for the vehicle above a step of height 2", () => {
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

  it("jumps onto a step of height 2 when the ceiling leaves room for SUV_SPEC.carHeight", () => {
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
        terrain([{ start: SUV_SPEC.hitboxFront + 0.2, height: 2 }], true),
        0.5,
      ),
    ).toBe(0);
  });

  it("jumps a height-1 step within look-ahead range, which a controlling rider keeps the engine from stepping (ADR 0035)", () => {
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

  it("jumps the higher step whichever rays at the same distance find heights 1 and 2", () => {
    const start = SUV_SPEC.hitboxFront + 0.2;
    fc.assert(
      fc.property(laneIndex, laneIndex, (low, high) => {
        fc.pre(low !== high);
        const lanes: (Lane | undefined)[] = [undefined, undefined, undefined];
        lanes[low] = { start, height: 1 };
        lanes[high] = { start, height: 2 };
        expect(stepHeight(terrain(lanes), 0.5)).toBe(2);
      }),
    );
  });

  it("does not jump for a block the hitbox already reaches over, such as a step it is climbing", () => {
    fc.assert(
      fc.property(speed, laneIndex, fc.constantFrom(1, 2), (s, i, height) => {
        const lane = STEP_LANES[i];
        const underHitbox: SolidAt = (ahead, side, dy) =>
          side === lane &&
          ahead > SUV_SPEC.hitboxFront - 1 &&
          ahead <= SUV_SPEC.hitboxFront &&
          dy < height;
        expect(stepHeight(underHitbox, s)).toBe(0);
      }),
    );
  });

  it("does not jump a height-1 step without room (SUV_SPEC.carHeight) above it, but does with the room", () => {
    const start = SUV_SPEC.hitboxFront + 0.2;
    const ceilingFor = (c: number) =>
      terrain([{ start, height: 1, ceiling: c }]);
    expect(stepHeight(ceilingFor(2), 0.5)).toBe(0);
    expect(stepHeight(ceilingFor(Math.ceil(1 + SUV_SPEC.carHeight)), 0.5)).toBe(
      1,
    );
  });

  it("does not jump yet for a step beyond look-ahead range", () => {
    expect(
      stepHeight(
        terrain([
          { start: SUV_SPEC.hitboxFront + lookahead(0.2) + 0.5, height: 2 },
        ]),
        0.2,
      ),
    ).toBe(0);
  });
});

function stepHeight(solid: SolidAt, speed: number): 0 | 1 | 2 {
  return probeStepHeight(solid, speed, {
    front: SUV_SPEC.hitboxFront,
    height: SUV_SPEC.carHeight,
  });
}
