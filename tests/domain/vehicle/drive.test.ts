import fc from "fast-check";
import { expect, it } from "vitest";
import { forward } from "../../../src/domain/shared/vec";
import type { TickContext } from "../../../src/domain/vehicle/drive";
import { BoatDrive } from "../../../src/domain/vehicle/kinds/sportsboat/drive";
import { SuvDrive } from "../../../src/domain/vehicle/kinds/suv/drive";
import { FORMS } from "../../../src/domain/vehicle/kinds/suv/form";
import { MOTION } from "../../../src/domain/vehicle/motion/constants";
import { initialMotion } from "../../../src/domain/vehicle/motion/motion";
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

it("aligns a boat below mountAlignSpeed and keeps its heading at or above it, without changing speed (ADR 0019)", () => {
  fc.assert(
    fc.property(
      yaw,
      number(30, 90),
      number(0, MOTION.mountAlignSpeed * 0.99),
      number(MOTION.mountAlignSpeed, 0.5),
      (heading, turn, slow, fast) => {
        const driverYaw = heading + turn;
        for (const speed of [
          slow,
          -slow,
          fast,
          -fast,
          MOTION.mountAlignSpeed,
          -MOTION.mountAlignSpeed,
        ]) {
          const drive = new BoatDrive(heading, {}).restore({
            motion: { ...initialMotion(heading), speed },
          });
          const before = drive.yaw;
          drive.onDriverMounted(driverYaw);
          expect(drive.yaw).toBe(
            Math.abs(speed) < MOTION.mountAlignSpeed ? driverYaw : before,
          );
          expect(drive.speed).toBe(speed);
        }
      },
    ),
  );
});

it("aligns a stopped SUV but keeps a moving SUV's heading and speed on mounting (ADR 0019)", () => {
  fc.assert(
    fc.property(yaw, number(30, 90), (heading, turn) => {
      const driverYaw = heading + turn;
      const stopped = new SuvDrive(heading, {});
      stopped.onDriverMounted(driverYaw);
      expect(stopped.yaw).toBe(driverYaw);
      expect(stopped.speed).toBe(0);
      for (const moveY of [-1, 1]) {
        const drive = new SuvDrive(heading, {});
        for (let tick = 0; tick < 20; tick++) {
          const f = forward(drive.yaw);
          drive.step(
            { moveX: 0, moveY, jump: false },
            {
              ...stillContext(true),
              tick,
              velocity: { x: f.x * drive.speed, y: 0, z: f.z * drive.speed },
            },
          );
        }
        const { speed, yaw: before } = drive;
        expect(Math.abs(speed)).toBeGreaterThanOrEqual(MOTION.mountAlignSpeed);
        drive.onDriverMounted(driverYaw);
        expect(drive.yaw).toBe(before);
        expect(drive.speed).toBe(speed);
      }
    }),
  );
});
