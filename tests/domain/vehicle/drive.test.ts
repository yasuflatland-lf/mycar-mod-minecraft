import { expect, it } from "vitest";
import { driveFor } from "../../../src/domain/vehicle/drive";
import { Vehicle } from "../../../src/domain/vehicle/vehicle";

it("starts the SUV drive in hover with the gear folded, as a vehicle rebuilt in hover does", () => {
  const drive = driveFor("suv", "hover");
  const rebuilt = Vehicle.rebuild("v", 0, [], "hover");
  expect(drive.form).toBe("hover");
  expect(drive.wheelsDown).toBe(false);
  expect([drive.form, drive.wheelsDown, drive.bankAngle]).toStrictEqual([
    rebuilt.form,
    rebuilt.wheelsDown,
    rebuilt.bankAngle,
  ]);
});
