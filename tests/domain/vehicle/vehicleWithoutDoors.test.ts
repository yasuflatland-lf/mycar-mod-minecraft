import { expect, it, vi } from "vitest";
import { SUV_PROFILE } from "../../../src/domain/vehicle/profile";
import { rebuildVehicle } from "../../../src/domain/vehicle/registry";
import { defined } from "../../support/defined";

vi.mock("../../../src/domain/vehicle/profile", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../../src/domain/vehicle/profile")
    >();
  return {
    ...original,
    profileOf: () => ({
      ...original.SUV_PROFILE,
      seats: { positions: original.SUV_PROFILE.seats.positions },
    }),
  };
});

it("emits SeatVacated without a door when the profile has no doors", () => {
  const vehicle = rebuildVehicle(
    "suv",
    "v",
    0,
    [
      {
        id: "driver",
        offset: defined(SUV_PROFILE.seats.positions[0], "driver seat"),
        yaw: 0,
        raw: { moveX: 0, moveY: 0, jump: false },
      },
    ],
    {},
  );
  const out = vehicle.tick({
    tick: 0,
    riders: [],
    velocity: { x: 0, z: 0 },
    onGround: true,
    solidAt: () => false,
    targets: () => [],
  });
  expect(out.events).toStrictEqual([
    { type: "SeatVacated", vehicleId: "v", seat: 0 },
  ]);
});
