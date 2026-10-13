import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  PlaceVehicle,
  type PlaceVehicleCommand,
} from "../../../src/application/vehicle/placeVehicle";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import { FakeWorld, InMemoryRepo } from "./fakes";

const cmd: PlaceVehicleCommand = {
  kind: "suv",
  playerId: "p",
  dimensionId: "minecraft:overworld",
  blockLocation: { x: 10, y: 64, z: -3 },
  yaw: 45,
  creative: false,
  slot: 2,
};

describe("PlaceVehicle (ADR 0008)", () => {
  it("records the placing player as the owner of each vehicle (ADR 0066)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1 }),
        fc.constantFrom(...VEHICLE_KINDS),
        fc.boolean(),
        (playerIds, kind, creative) => {
          const world = new FakeWorld();
          const placement = new PlaceVehicle(world, new InMemoryRepo());
          for (const playerId of playerIds)
            expect(
              placement.execute({ ...cmd, playerId, kind, creative }),
            ).toBe(true);
          expect([...world.owners.values()]).toEqual(playerIds);
        },
      ),
    );
  });

  it("consumes one item of the command's kind from the slot it was used from, then places a vehicle on the block and saves the aggregate", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    expect(new PlaceVehicle(world, repo).execute(cmd)).toBe(true);
    expect(world.calls).toEqual([
      "consume:p:2:suv",
      "spawn:minecraft:overworld:10.5,65,-2.5:45:suv",
    ]);
    expect(repo.get("v1")?.kind).toBe(cmd.kind);
    expect(repo.get("v1")?.yaw).toBeCloseTo(45);
  });

  it("does not consume the item in creative mode", () => {
    const world = new FakeWorld();
    new PlaceVehicle(world, new InMemoryRepo()).execute({
      ...cmd,
      creative: true,
    });
    expect(world.calls.some((c) => c.startsWith("consume"))).toBe(false);
  });

  it("does not place the vehicle or consume the item when there is no room, such as under a low ceiling", () => {
    const world = new FakeWorld();
    world.air = (at) => !(at.y === 66 && at.x === 10 && at.z === -3);
    expect(new PlaceVehicle(world, new InMemoryRepo()).execute(cmd)).toBe(
      false,
    );
    expect(world.calls).toEqual([]);
    expect(world.owners.size).toBe(0);
  });

  it("does not place a vehicle when the slot no longer holds the item, such as after switching slots or dropping it (ADR 0024)", () => {
    const world = new FakeWorld();
    world.itemInSlot = false;
    const repo = new InMemoryRepo();
    expect(new PlaceVehicle(world, repo).execute(cmd)).toBe(false);
    expect(world.calls).toEqual([]);
    expect(repo.get("v1")).toBeUndefined();
    expect(world.owners.size).toBe(0);
  });

  it("places a vehicle in creative mode without needing the item in the slot", () => {
    const world = new FakeWorld();
    world.itemInSlot = false;
    expect(
      new PlaceVehicle(world, new InMemoryRepo()).execute({
        ...cmd,
        creative: true,
      }),
    ).toBe(true);
  });
});
