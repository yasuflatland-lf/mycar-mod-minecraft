import { describe, expect, it } from "vitest";
import { HitVehicle } from "../../../src/application/vehicle/hitVehicle";
import { createVehicle } from "../../../src/domain/vehicle/registry";
import { FakeFleetRepository, FakeWorld, InMemoryRepo } from "./fakes";

describe("HitVehicle (ADR 0008)", () => {
  it("on the third hit, drops the item, removes the vehicle, and discards the aggregate", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    repo.save(createVehicle("suv", "a", 0));
    const fleets = new FakeFleetRepository();
    fleets.state = { order: ["a", "b"], evicted: [] };
    const uc = new HitVehicle(world, repo, fleets);
    expect(
      [1, 2, 3].map((tick) => uc.execute({ vehicleId: "a", tick })),
    ).toEqual([false, false, true]);
    expect(world.calls).toEqual(["drop:a", "remove:a"]);
    expect(repo.get("a")).toBeUndefined();
    // A broken vehicle no longer counts toward the limit (ADR 0038).
    expect(fleets.state.order).toEqual(["b"]);
  });

  it("does nothing for a vehicle not in the repository", () => {
    const world = new FakeWorld();
    expect(
      new HitVehicle(
        world,
        new InMemoryRepo(),
        new FakeFleetRepository(),
      ).execute({
        vehicleId: "x",
        tick: 0,
      }),
    ).toBe(false);
    expect(world.calls).toEqual([]);
  });
});
