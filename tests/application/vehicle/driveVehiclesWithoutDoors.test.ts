import { expect, it, vi } from "vitest";
import { DriveVehicles } from "../../../src/application/vehicle/driveVehicles";
import { SUV_PROFILE } from "../../../src/domain/vehicle/profile";
import { defined } from "../../support/defined";
import { FakeWorld, InMemoryRepo, snapshot } from "./fakes";

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

it("plays no door when a rider leaves a vehicle whose profile has no doors", () => {
  const world = new FakeWorld();
  const log = { warn: vi.fn() };
  const drive = new DriveVehicles(world, new InMemoryRepo(), log);
  const playDoor = vi.spyOn(world, "playDoor");
  world.snapshots = [
    snapshot("v", {
      riders: [
        {
          id: "driver",
          offset: defined(SUV_PROFILE.seats.positions[0], "driver seat"),
          yaw: 0,
          raw: { moveX: 0, moveY: 0, jump: false },
        },
      ],
    }),
  ];
  drive.execute(0);
  world.snapshots = [snapshot("v")];
  drive.execute(1);
  expect(playDoor).not.toHaveBeenCalled();
  expect(log.warn).not.toHaveBeenCalled();
});
