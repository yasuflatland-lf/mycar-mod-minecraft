import fc from "fast-check";
import { expect, it } from "vitest";
import { BoatDrive } from "../../../src/domain/vehicle/boatDrive";
import type { Drive, TickContext } from "../../../src/domain/vehicle/drive";
import { FORMS } from "../../../src/domain/vehicle/form";
import {
  VEHICLE_KINDS,
  type VehicleKind,
} from "../../../src/domain/vehicle/kind";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { SuvDrive } from "../../../src/domain/vehicle/suvDrive";
import { propertyValue } from "../../support/engineCommands";
import { waterSensors } from "../../support/waterDepth";

const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const yaw = number(-180, 180);

/** A stopped vehicle with no blocks or ram targets around it. */
function stillContext(onGround: boolean, waterDepth = 0): TickContext {
  return {
    tick: 0,
    velocity: { x: 0, y: 0, z: 0 },
    onGround,
    ...waterSensors(waterDepth),
    solidAt: () => false,
    targets: () => [],
  };
}

/** Each kind's drive, on its own ground: the SUV on dry land, the boat afloat. */
const KIND_DRIVES: Record<
  VehicleKind,
  { drive(heading: number): Drive; ctx: TickContext }
> = {
  suv: {
    drive: (heading) => new SuvDrive(heading, { form: "car" }),
    ctx: stillContext(true),
  },
  sportsboat: {
    drive: (heading) => new BoatDrive(heading, {}),
    ctx: stillContext(false, 0.5),
  },
};

it("starts the SUV drive in the given form, unbanked, with the wheels down only in car form", () => {
  fc.assert(
    fc.property(fc.constantFrom(...FORMS), yaw, (form, heading) => {
      const drive = new SuvDrive(heading, { form: form });
      expect(drive.form).toBe(form);
      expect(drive.wheelsDown).toBe(form === "car");
      expect(drive.bankAngle).toBe(0);
    }),
  );
});

it("keeps an SUV drive started in hover hovering with the gear folded on its first airborne tick", () => {
  const drive = new SuvDrive(0, { form: "hover" });
  const result = drive.step(
    { moveX: 0, moveY: 0, jump: false },
    stillContext(false),
  );
  expect(propertyValue(result.commands, "form")).toBeUndefined();
  expect(propertyValue(result.commands, "gear_down")).toBe(false);
  expect(propertyValue(result.commands, "bank")).toBe(0);
  expect(drive.form).toBe("hover");
  expect(drive.wheelsDown).toBe(false);
});

it("turns every kind's drive to a new driver's yaw only below mountAlignSpeed, and keeps its speed (ADR 0019)", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...VEHICLE_KINDS),
      yaw,
      yaw,
      fc.array(number(-1, 1), { maxLength: 4 }),
      (kind, heading, driverYaw, throttles) => {
        const { drive: make, ctx } = KIND_DRIVES[kind];
        const drive = make(heading);
        throttles.forEach((moveY, tick) => {
          drive.step({ moveX: 0, moveY, jump: false }, { ...ctx, tick });
        });
        const { speed, yaw: before } = drive;
        drive.onDriverMounted(driverYaw);
        expect(drive.yaw).toBe(
          Math.abs(speed) < SPEC.mountAlignSpeed ? driverYaw : before,
        );
        expect(drive.speed).toBe(speed);
      },
    ),
  );
});
