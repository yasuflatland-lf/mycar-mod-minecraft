import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FORMS } from "../../src/domain/vehicle/form";
import { nextGearDown } from "../../src/domain/vehicle/landingGear";

describe("nextGearDown (ADR 0033)", () => {
  const form = fc.constantFrom(...FORMS);

  it("is down on the ground and up in takeoff and flight, whatever lies below", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (prev, near) => {
        expect(nextGearDown(prev, "car", () => near)).toBe(true);
        expect(nextGearDown(prev, "takeoff", () => near)).toBe(false);
        expect(nextGearDown(prev, "hover", () => near)).toBe(false);
      }),
    );
  });

  it("comes down while landing once the ground is near, and stays down", () => {
    expect(nextGearDown(false, "landing", () => false)).toBe(false);
    expect(nextGearDown(false, "landing", () => true)).toBe(true);
    expect(nextGearDown(true, "landing", () => false)).toBe(true);
  });

  it("probes the ground only while landing with the wheels up", () => {
    fc.assert(
      fc.property(fc.boolean(), form, (prev, m) => {
        let probed = false;
        nextGearDown(prev, m, () => {
          probed = true;
          return false;
        });
        expect(probed).toBe(m === "landing" && !prev);
      }),
    );
  });
});
