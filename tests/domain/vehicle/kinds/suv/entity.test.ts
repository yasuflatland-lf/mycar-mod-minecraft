import fc from "fast-check";
import { expect, it } from "vitest";
import {
  DOOR_BY_SEAT,
  doorCommands,
  formCommands,
} from "../../../../../src/domain/vehicle/kinds/suv/entity";
import { FORMS } from "../../../../../src/domain/vehicle/kinds/suv/form";

it("keeps gravity on only in car form and writes the form after the event (ADR 0021, 0039)", () => {
  fc.assert(
    fc.property(fc.constantFrom(...FORMS), (form) => {
      expect(formCommands(form)).toStrictEqual([
        {
          type: "triggerEvent",
          name: form === "car" ? "gravity_on" : "gravity_off",
        },
        { type: "setProperty", name: "form", value: form },
      ]);
    }),
  );
});

it("switches gravity off for submarine before writing its form", () => {
  expect(formCommands("submarine")).toStrictEqual([
    { type: "triggerEvent", name: "gravity_off" },
    { type: "setProperty", name: "form", value: "submarine" },
  ]);
});

it("opens each seat's door and plays its sound", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 3 }), (seat) => {
      expect(doorCommands(seat)).toStrictEqual([
        { type: "playAnimation", name: DOOR_BY_SEAT[seat] },
        { type: "playSound", name: "random.door_open" },
      ]);
    }),
  );
});

it("uses the declared door list and emits nothing where it has no entry", () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: -1, max: 9 }), { maxLength: 8 }),
      (seats) => {
        for (const seat of seats) {
          const door = DOOR_BY_SEAT[seat];
          expect(doorCommands(seat)).toStrictEqual(
            door === undefined
              ? []
              : [
                  { type: "playAnimation", name: door },
                  { type: "playSound", name: "random.door_open" },
                ],
          );
        }
      },
    ),
  );
});

it("emits nothing for a seat the vehicle does not have", () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.integer({ max: -1 }), fc.integer({ min: 4 })),
      (seat) => {
        expect(doorCommands(seat)).toStrictEqual([]);
      },
    ),
  );
});

it("declares the established form values in their engine order", () => {
  expect(FORMS).toEqual(["car", "takeoff", "hover", "landing", "submarine"]);
});
