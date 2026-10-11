import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bankSink, stepBank } from "../../src/domain/vehicle/bank";
import { FORMS } from "../../src/domain/vehicle/form";
import { SPEC } from "../../src/domain/vehicle/spec";

const angle = fc.double({ min: -SPEC.maxBank, max: SPEC.maxBank, noNaN: true });
const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const turn = fc
  .double({ min: -3, max: 3, noNaN: true })
  .map((t) => t * SPEC.turnRate);
const form = fc.constantFrom(...FORMS);
// Forms that roll into turns: flight (ADR 0026) and the submarine (ADR 0044).
const BANKING = ["hover", "submarine"] as const;
const banking = fc.constantFrom(...BANKING);

describe("stepBank (ADR 0026)", () => {
  it("moves at most bankRate per tick and stays within maxBank", () => {
    fc.assert(
      fc.property(angle, form, yaw, turn, (prev, m, y, d) => {
        const next = stepBank(prev, m, y, y + d);
        expect(Math.abs(next - prev)).toBeLessThanOrEqual(SPEC.bankRate + 1e-9);
        expect(Math.abs(next)).toBeLessThanOrEqual(SPEC.maxBank + 1e-9);
      }),
    );
  });

  it("banks toward the turn in hover and submarine form: right side down when the heading turns right (yaw increases)", () => {
    fc.assert(
      fc.property(
        banking,
        yaw,
        fc.double({ min: 0.1, max: 20, noNaN: true }),
        (m, y, d) => {
          expect(stepBank(0, m, y, y + d)).toBeGreaterThan(0);
          expect(stepBank(0, m, y, y - d)).toBeLessThan(0);
        },
      ),
    );
  });

  it("measures the turn across the ±180° wrap", () => {
    expect(stepBank(0, "hover", 178, -178)).toBeGreaterThan(0);
    expect(stepBank(0, "hover", -178, 178)).toBeLessThan(0);
  });

  it("settles at maxBank for a turn at the full turn rate", () => {
    for (const m of BANKING) {
      let bank = 0;
      for (let t = 0; t < 30; t++) bank = stepBank(bank, m, 0, SPEC.turnRate);
      expect(bank, m).toBe(SPEC.maxBank);
    }
  });

  it("levels out when the turn stops or the vehicle is not flying or submerged", () => {
    fc.assert(
      fc.property(angle, form, yaw, turn, (start, m, y, d) => {
        let bank = start;
        const level = (BANKING as readonly string[]).includes(m) ? 0 : d;
        const ticks = Math.ceil((2 * SPEC.maxBank) / SPEC.bankRate);
        for (let t = 0; t < ticks; t++) bank = stepBank(bank, m, y, y + level);
        expect(bank).toBe(0);
      }),
    );
  });
});

describe("bankSink (ADR 0026)", () => {
  // A submarine holds its depth through a banked turn: buoyancy and the
  // climb input set its vertical speed instead (ADR 0044).
  it("sinks only while flying, more the steeper the bank, up to bankSink at full bank", () => {
    fc.assert(
      fc.property(angle, angle, form, (a, b, m) => {
        const sink = bankSink(m, a);
        if (m !== "hover") {
          expect(sink).toBe(0);
          return;
        }
        expect(sink).toBeGreaterThanOrEqual(0);
        expect(sink).toBeLessThanOrEqual(SPEC.bankSink + 1e-12);
        if (Math.abs(a) < Math.abs(b))
          expect(sink).toBeLessThanOrEqual(bankSink(m, b));
      }),
    );
  });

  it("holds altitude when level", () => {
    expect(bankSink("hover", 0)).toBe(0);
  });
});
