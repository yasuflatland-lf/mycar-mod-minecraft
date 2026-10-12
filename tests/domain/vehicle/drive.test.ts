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
import { waterSensors } from "../../support/waterDepth";

const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const yaw = number(-180, 180);

/** Each kind's drive, on its own ground: the SUV on dry land, the boat afloat. */
const KIND_DRIVES: Record<
  VehicleKind,
  { drive(heading: number): Drive; ctx: TickContext }
> = {
  suv: {
    drive: (heading) => new SuvDrive(heading, "car"),
    ctx: {
      tick: 0,
      velocity: { x: 0, y: 0, z: 0 },
      onGround: true,
      ...waterSensors(),
      solidAt: () => false,
      targets: () => [],
    },
  },
  sportsboat: {
    drive: (heading) => new BoatDrive(heading),
    ctx: {
      tick: 0,
      velocity: { x: 0, y: 0, z: 0 },
      onGround: false,
      ...waterSensors(0.5),
      solidAt: () => false,
      targets: () => [],
    },
  },
};

it("starts the SUV drive in the given form, unbanked, with the wheels down only in car form", () => {
  fc.assert(
    fc.property(fc.constantFrom(...FORMS), yaw, (form, heading) => {
      const drive = new SuvDrive(heading, form);
      expect(drive.form).toBe(form);
      expect(drive.wheelsDown).toBe(form === "car");
      expect(drive.bankAngle).toBe(0);
    }),
  );
});

it("keeps an SUV drive started in hover hovering with the gear folded on its first airborne tick", () => {
  const drive = new SuvDrive(0, "hover");
  const ctx: TickContext = {
    tick: 0,
    velocity: { x: 0, y: 0, z: 0 },
    onGround: false,
    ...waterSensors(),
    solidAt: () => false,
    targets: () => [],
  };
  const result = drive.step({ moveX: 0, moveY: 0, jump: false }, ctx);
  expect(result.form).toBeUndefined();
  expect(result.gearDown).toBe(false);
  expect(result.bank).toBe(0);
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
