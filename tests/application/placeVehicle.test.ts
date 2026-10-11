import { describe, expect, it } from "vitest";
import { PlaceVehicle } from "../../src/application/placeVehicle";
import { FakeWorld, InMemoryRepo } from "./fakes";

const cmd = {
  playerId: "p",
  dimensionId: "minecraft:overworld",
  blockLocation: { x: 10, y: 64, z: -3 },
  yaw: 45,
  creative: false,
};

describe("PlaceVehicle (ADR 0008)", () => {
  it("places a vehicle on the block, saves the aggregate, and consumes one item", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    expect(new PlaceVehicle(world, repo).execute(cmd)).toBe(true);
    expect(world.calls).toEqual([
      "spawn:minecraft:overworld:10.5,65,-2.5:45",
      "consume:p",
    ]);
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
  });
});
