import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dot, forward, rightOf } from "../../../src/domain/shared/vec";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../../src/domain/vehicle/kinds/suv/spec";
import {
  type RamHit,
  type RamTarget,
  ramDamage,
  selectHits,
} from "../../../src/domain/vehicle/ram";
import { SPEC } from "../../../src/domain/vehicle/spec";

// fc.double draws most values within a hair of 0, so it barely turns the
// vehicle off the z axis. Whole hundredths of a degree cover every heading.
const yaw = fc.integer({ min: -18_000, max: 18_000 }).map((c) => c / 100);
const fastSpeed = fc.double({
  min: SPEC.ramMinSpeed + 0.001,
  max: SUV_SPEC.maxSpeed,
  noNaN: true,
});
const fastReverse = fc.double({
  min: -SUV_SPEC.maxReverse,
  max: -SPEC.ramMinSpeed - 0.001,
  noNaN: true,
});

function onlyHit(hits: readonly RamHit[]): RamHit {
  expect(hits).toHaveLength(1);
  const [hit] = hits;
  if (hit === undefined) throw new Error("expected one hit");
  return hit;
}

function expectedPushMagnitude(speed: number): number {
  return SPEC.ramPushBase + Math.abs(speed) * SPEC.ramPushPerSpeed;
}

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
    expect(ramDamage(SUV_SPEC.maxSpeed)).toBe(18);
  });
});

describe("selectHits (ADR 0006)", () => {
  const reach = SUV_SPEC.bodyFront + SPEC.targetHalfWidth;
  const halfWidth = SUV_SPEC.bodyHalfWidth + SPEC.targetHalfWidth;
  // A target exactly on the boundary can fall outside the area due to rounding in forward and rightOf, so generate only points slightly inside both ends
  const insideAhead = fc.double({ min: 1e-6, max: reach - 1e-6, noNaN: true });
  const insideSide = fc.double({
    min: -halfWidth + 1e-6,
    max: halfWidth - 1e-6,
    noNaN: true,
  });

  it("hits targets in the detection area ahead and pushes them in the direction of travel", () => {
    fc.assert(
      fc.property(
        yaw,
        fastSpeed,
        insideAhead,
        insideSide,
        fc.double({
          min: SPEC.ramMinDy + 1e-6,
          max: SPEC.ramMaxDy - 1e-6,
          noNaN: true,
        }),
        (y, s, ahead, side, dy) => {
          const f = forward(y);
          const hits = selectHits(
            f,
            s,
            [at(y, ahead, side, dy)],
            new Map(),
            0,
            SUV_PROFILE.ram,
          );
          const { push, pushUp } = onlyHit(hits);
          expect(dot(push, f)).toBeGreaterThan(0);
          expect(Math.hypot(push.x, push.z)).toBeCloseTo(
            expectedPushMagnitude(s),
            9,
          );
          expect(pushUp).toBe(SPEC.ramPushUp);
        },
      ),
    );
  });

  it("does not hit targets beside the detection area", () => {
    const beside = fc
      .tuple(
        fc.double({ min: halfWidth + 0.01, max: 3, noNaN: true }),
        fc.boolean(),
      )
      .map(([d, left]) => (left ? -d : d));
    fc.assert(
      fc.property(yaw, fastSpeed, insideAhead, beside, (y, s, ahead, side) => {
        expect(
          selectHits(
            forward(y),
            s,
            [at(y, ahead, side)],
            new Map(),
            0,
            SUV_PROFILE.ram,
          ),
        ).toHaveLength(0);
      }),
    );
  });

  it("does not hit targets above or below the detection area", () => {
    const offLevel = fc.oneof(
      fc.double({ min: -3, max: SPEC.ramMinDy - 0.01, noNaN: true }),
      fc.double({ min: SPEC.ramMaxDy + 0.01, max: 3, noNaN: true }),
    );
    fc.assert(
      fc.property(
        yaw,
        fastSpeed,
        insideAhead,
        insideSide,
        offLevel,
        (y, s, ahead, side, dy) => {
          expect(
            selectHits(
              forward(y),
              s,
              [at(y, ahead, side, dy)],
              new Map(),
              0,
              SUV_PROFILE.ram,
            ),
          ).toHaveLength(0);
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
          selectHits(
            forward(y),
            s,
            [at(y, ahead, 0)],
            new Map(),
            0,
            SUV_PROFILE.ram,
          ),
        ).toHaveLength(0);
      }),
    );
  });

  it("hits targets behind when reversing and pushes them away from the car", () => {
    fc.assert(
      fc.property(
        yaw,
        fastReverse,
        insideAhead,
        insideSide,
        (y, s, behind, side) => {
          const f = forward(y);
          const hits = selectHits(
            f,
            s,
            [at(y, -behind, side)],
            new Map(),
            0,
            SUV_PROFILE.ram,
          );
          const { push, pushUp } = onlyHit(hits);
          expect(dot(push, f)).toBeLessThan(0);
          expect(Math.hypot(push.x, push.z)).toBeCloseTo(
            expectedPushMagnitude(s),
            9,
          );
          expect(pushUp).toBe(SPEC.ramPushUp);
        },
      ),
    );
  });

  it("does not hit protected occupants (regardless of which car they occupy)", () => {
    fc.assert(
      fc.property(
        yaw,
        fastSpeed,
        fc.double({ min: 0, max: reach, noNaN: true }),
        (y, s, ahead) => {
          expect(
            selectHits(
              forward(y),
              s,
              [at(y, ahead, 0, 0, true)],
              new Map(),
              0,
              SUV_PROFILE.ram,
            ),
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
            SUV_PROFILE.ram,
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
        SUV_PROFILE.ram,
      ),
    ).toHaveLength(1);
  });

  it("hits a target on any edge of the detection area", () => {
    const f = forward(0);
    const edges: RamTarget[] = [
      at(0, 0, 0),
      at(0, reach, 0),
      at(0, 1, halfWidth),
      at(0, 1, -halfWidth),
      at(0, 1, 0, SPEC.ramMinDy),
      at(0, 1, 0, SPEC.ramMaxDy),
    ];
    for (const target of edges)
      expect(
        selectHits(f, 0.5, [target], new Map(), 0, SUV_PROFILE.ram),
        JSON.stringify(target),
      ).toHaveLength(1);
  });

  it("does not hit at speeds of 0.15 or below", () => {
    expect(
      selectHits(
        forward(0),
        SPEC.ramMinSpeed,
        [at(0, 1, 0)],
        new Map(),
        0,
        SUV_PROFILE.ram,
      ),
    ).toHaveLength(0);
  });
});
