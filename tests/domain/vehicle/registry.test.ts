import { expect, it } from "vitest";
import { rebuildVehicle } from "../../../src/domain/vehicle/registry";

it("restores hover and falls back to car for invalid or missing forms", () => {
  expect(rebuildVehicle("suv", "v", 0, [], { form: "hover" }).form).toBe(
    "hover",
  );
  expect(rebuildVehicle("suv", "v", 0, [], { form: "bogus" }).form).toBe("car");
  expect(rebuildVehicle("suv", "v", 0, [], {}).form).toBe("car");
});
