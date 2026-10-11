import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bankSink, stepBank } from "../../src/domain/vehicle/bank";
import { FLIGHT_MODES } from "../../src/domain/vehicle/flight";
import { SPEC } from "../../src/domain/vehicle/spec";

const angle = fc.double({ min: -SPEC.maxBank, max: SPEC.maxBank, noNaN: true });
const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const turn = fc
  .double({ min: -3, max: 3, noNaN: true })
  .map((t) => t * SPEC.turnRate);
const mode = fc.constantFrom(...FLIGHT_MODES);

describe("stepBank (ADR 0026)", () => {
  it("moves at most bankRate per tick and stays within maxBank", () => {
    fc.assert(
      fc.property(angle, mode, yaw, turn, (prev, m, y, d) => {
        const next = stepBank(prev, m, y, y + d);
        expect(Math.abs(next - prev)).toBeLessThanOrEqual(SPEC.bankRate + 1e-9);
        expect(Math.abs(next)).toBeLessThanOrEqual(SPEC.maxBank + 1e-9);
      }),
    );
  });

  it("banks toward the turn in flight: right side down when the heading turns right (yaw increases)", () => {
    fc.assert(
      fc.property(
        yaw,
        fc.double({ min: 0.1, max: 20, noNaN: true }),
        (y, d) => {
          expect(stepBank(0, "flying", y, y + d)).toBeGreaterThan(0);
          expect(stepBank(0, "flying", y, y - d)).toBeLessThan(0);
        },
      ),
    );
  });

  it("measures the turn across the ±180° wrap", () => {
    expect(stepBank(0, "flying", 178, -178)).toBeGreaterThan(0);
    expect(stepBank(0, "flying", -178, 178)).toBeLessThan(0);
  });

  it("settles at maxBank for a turn at the full turn rate", () => {
    let bank = 0;
    for (let t = 0; t < 30; t++)
      bank = stepBank(bank, "flying", 0, SPEC.turnRate);
    expect(bank).toBe(SPEC.maxBank);
  });

  it("levels out when the turn stops or the vehicle is not flying", () => {
    fc.assert(
      fc.property(angle, mode, yaw, turn, (start, m, y, d) => {
        let bank = start;
        const level = m === "flying" ? 0 : d;
        const ticks = Math.ceil((2 * SPEC.maxBank) / SPEC.bankRate);
        for (let t = 0; t < ticks; t++) bank = stepBank(bank, m, y, y + level);
        expect(bank).toBe(0);
      }),
    );
  });
});

describe("bankSink (ADR 0026)", () => {
  it("sinks only while flying, more the steeper the bank, up to bankSink at full bank", () => {
    fc.assert(
      fc.property(angle, angle, mode, (a, b, m) => {
        const sink = bankSink(m, a);
        if (m !== "flying") {
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
    expect(bankSink("flying", 0)).toBe(0);
  });
});
