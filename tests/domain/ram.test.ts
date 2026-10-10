// tests/domain/ram.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward, rightOf } from "../../src/domain/shared/vec";
import {
  type RamTarget,
  ramDamage,
  selectHits,
} from "../../src/domain/vehicle/ram";
import { SPEC } from "../../src/domain/vehicle/spec";

const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const fastSpeed = fc.double({
  min: SPEC.ramMinSpeed + 0.001,
  max: SPEC.maxSpeed,
  noNaN: true,
});

function at(
  yawDeg: number,
  ahead: number,
  side: number,
  dy = 0,
  protectedOccupant = false,
): RamTarget {
  const f = forward(yawDeg);
  const r = rightOf(f);
  return {
    id: "t",
    offset: { x: f.x * ahead + r.x * side, y: dy, z: f.z * ahead + r.z * side },
    protectedOccupant,
  };
}

describe("ramDamage (ADR 0006)", () => {
  it("is monotonically nondecreasing with speed and at least 1 at speeds where ram occurs", () => {
    fc.assert(
      fc.property(fastSpeed, fastSpeed, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(ramDamage(lo)).toBeLessThanOrEqual(ramDamage(hi));
        expect(ramDamage(lo)).toBeGreaterThanOrEqual(1);
      }),
    );
  });

  it("is 18 at maximum speed", () => {
    expect(ramDamage(SPEC.maxSpeed)).toBe(18);
  });
});

describe("selectHits (ADR 0006)", () => {
  const reach = SPEC.bodyFront + SPEC.targetHalfWidth;

  it("hits targets in the detection area ahead and pushes them in the direction of travel", () => {
    // A target exactly on the boundary can fall outside the area due to rounding in forward and rightOf, so generate only points slightly inside both ends
    const inside = fc.double({ min: 1e-6, max: reach - 1e-6, noNaN: true });
    fc.assert(
      fc.property(
        yaw,
        fastSpeed,
        inside,
        fc.double({ min: -1.4, max: 1.4, noNaN: true }),
        (y, s, ahead, side) => {
          const hits = selectHits(
            forward(y),
            s,
            [at(y, ahead, side)],
            new Map(),
            0,
          );
          expect(hits).toHaveLength(1);
          const f = forward(y);
          expect(hits[0]!.push.x * f.x + hits[0]!.push.z * f.z).toBeGreaterThan(
            0,
          );
        },
      ),
    );
  });

  it("does not hit targets behind or outside the detection area", () => {
    const outside = fc.oneof(
      fc.double({ min: -3, max: -0.01, noNaN: true }),
      fc.double({ min: reach + 0.01, max: 3, noNaN: true }),
    );
    fc.assert(
      fc.property(yaw, fastSpeed, outside, (y, s, ahead) => {
        expect(
          selectHits(forward(y), s, [at(y, ahead, 0)], new Map(), 0),
        ).toHaveLength(0);
      }),
    );
  });

  it("hits targets behind when reversing", () => {
    expect(
      selectHits(forward(0), -0.2, [at(0, -1, 0)], new Map(), 0),
    ).toHaveLength(1);
  });

  it("does not hit protected occupants (regardless of which car they occupy)", () => {
    fc.assert(
      fc.property(
        yaw,
        fastSpeed,
        fc.double({ min: 0, max: reach, noNaN: true }),
        (y, s, ahead) => {
          expect(
            selectHits(forward(y), s, [at(y, ahead, 0, 0, true)], new Map(), 0),
          ).toHaveLength(0);
        },
      ),
    );
  });

  it("does not hit the same target again within 10 ticks", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: SPEC.ramCooldown - 1 }), (dt) => {
        expect(
          selectHits(
            forward(0),
            0.5,
            [at(0, 1, 0)],
            new Map([["t", 100]]),
            100 + dt,
          ),
        ).toHaveLength(0);
      }),
    );
    expect(
      selectHits(
        forward(0),
        0.5,
        [at(0, 1, 0)],
        new Map([["t", 100]]),
        100 + SPEC.ramCooldown,
      ),
    ).toHaveLength(1);
  });

  it("does not hit at speeds of 0.15 or below", () => {
    expect(
      selectHits(forward(0), SPEC.ramMinSpeed, [at(0, 1, 0)], new Map(), 0),
    ).toHaveLength(0);
  });
});
