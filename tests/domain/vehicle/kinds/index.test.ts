import { expect, it } from "vitest";
import { SuvDrive } from "../../../../src/domain/vehicle/kinds/suv/drive";

it("restores hover and falls back to car for invalid or missing forms", () => {
  expect(new SuvDrive(0, { form: "hover" }).form).toBe("hover");
  expect(new SuvDrive(0, { form: "bogus" }).form).toBe("car");
  expect(new SuvDrive(0, {}).form).toBe("car");
});
