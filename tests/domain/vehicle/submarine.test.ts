import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { submarineVerticalSpeed } from "../../../src/domain/vehicle/submarine";
import { waterDepth as depth } from "../../support/waterDepth";

const finite = (d: number) => (Number.isFinite(d) ? d : 0);
const input = fc.record({
  climb: fc.double(),
  controlled: fc.boolean(),
  rising: fc.boolean(),
  waterDepth: fc.double(),
});

describe("submarineVerticalSpeed", () => {
  it("a controlled finite non-zero climb wins over steps and buoyancy", () => {
    fc.assert(
      fc.property(
        fc
          .double({ noNaN: true, noDefaultInfinity: true })
          .filter((c) => c !== 0),
        fc.boolean(),
        depth,
        (climb, rising, waterDepth) => {
          expect(
            submarineVerticalSpeed({
              climb,
              controlled: true,
              rising,
              waterDepth,
            }),
          ).toBe(Math.max(-1, Math.min(1, climb)) * SPEC.maxClimb);
        },
      ),
    );
  });

  it("a step rises fully when there is no controlled climb", () => {
    fc.assert(
      fc.property(input, (i) => {
        const climb = i.controlled ? 0 : i.climb;
        expect(submarineVerticalSpeed({ ...i, climb, rising: true })).toBe(
          SPEC.maxClimb,
        );
      }),
    );
  });

  it("controlled buoyancy only sinks above the float line and otherwise holds depth", () => {
    fc.assert(
      fc.property(depth, (waterDepth) => {
        const speed = submarineVerticalSpeed({
          climb: 0,
          controlled: true,
          rising: false,
          waterDepth,
        });
        const d = finite(waterDepth);
        expect(speed).toBeLessThanOrEqual(0);
        expect(speed < 0).toBe(d < SPEC.floatDraft);
        if (d >= SPEC.floatDraft) expect(speed).toBe(0);
      }),
    );
  });

  it("uncontrolled buoyancy returns toward the float line", () => {
    fc.assert(
      fc.property(depth, fc.double(), (waterDepth, climb) => {
        const speed = submarineVerticalSpeed({
          climb,
          controlled: false,
          rising: false,
          waterDepth,
        });
        const d = finite(waterDepth);
        expect(speed > 0).toBe(d > SPEC.floatDraft);
        expect(speed < 0).toBe(d < SPEC.floatDraft);
        expect(speed).toBeCloseTo(
          Math.max(
            -SPEC.surfaceRise,
            Math.min(SPEC.surfaceRise, (d - SPEC.floatDraft) * SPEC.floatGain),
          ),
          12,
        );
      }),
    );
    for (const controlled of [true, false]) {
      expect(
        submarineVerticalSpeed({
          climb: 0,
          controlled,
          rising: false,
          waterDepth: SPEC.floatDraft,
        }),
      ).toBe(0);
    }
  });

  it("is continuous across the float line", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -0.001, max: 0.001, noNaN: true }),
        fc.boolean(),
        (delta, controlled) => {
          const speed = submarineVerticalSpeed({
            climb: 0,
            controlled,
            rising: false,
            waterDepth: SPEC.floatDraft + delta,
          });
          expect(Math.abs(speed)).toBeLessThanOrEqual(
            (Math.abs(delta) + Number.EPSILON) * SPEC.floatGain,
          );
        },
      ),
    );
  });

  it("always produces a finite speed within maxClimb", () => {
    fc.assert(
      fc.property(input, (i) => {
        const speed = submarineVerticalSpeed(i);
        expect(Number.isFinite(speed)).toBe(true);
        expect(Math.abs(speed)).toBeLessThanOrEqual(SPEC.maxClimb);
      }),
    );
  });

  it("treats non-finite climbs as no command and non-finite depths as dry", () => {
    for (const climb of [NaN, Infinity, -Infinity])
      for (const waterDepth of [NaN, Infinity, -Infinity])
        for (const controlled of [true, false])
          for (const rising of [true, false]) {
            expect(
              submarineVerticalSpeed({ climb, waterDepth, controlled, rising }),
            ).toBe(rising ? SPEC.maxClimb : -SPEC.surfaceRise);
          }
  });
});
