import fc from "fast-check";
import { expect, it } from "vitest";
import { driveFor } from "../../../src/domain/vehicle/drive";
import { FORMS } from "../../../src/domain/vehicle/form";
import { initialMotion } from "../../../src/domain/vehicle/motion";
import { SUV_PROFILE } from "../../../src/domain/vehicle/profile";
import type { TickContext } from "../../../src/domain/vehicle/vehicle";
import { waterSensors } from "../../support/waterDepth";

it("starts the SUV drive in the given form, unbanked, with the wheels down only in car form", () => {
  fc.assert(
    fc.property(fc.constantFrom(...FORMS), (form) => {
      const drive = driveFor("suv", form);
      expect(drive.form).toBe(form);
      expect(drive.wheelsDown).toBe(form === "car");
      expect(drive.bankAngle).toBe(0);
    }),
  );
});

it("keeps an SUV drive started in hover hovering with the gear folded on its first airborne tick", () => {
  const drive = driveFor("suv", "hover");
  const ctx: TickContext = {
    tick: 0,
    riders: [],
    velocity: { x: 0, y: 0, z: 0 },
    onGround: false,
    ...waterSensors(),
    solidAt: () => false,
    targets: () => [],
  };
  const result = drive.step(
    initialMotion(0),
    { moveX: 0, moveY: 0, jump: false },
    ctx,
    SUV_PROFILE,
  );
  expect(result.form).toBeUndefined();
  expect(result.gearDown).toBe(false);
  expect(result.bank).toBe(0);
  expect(drive.form).toBe("hover");
  expect(drive.wheelsDown).toBe(false);
});
