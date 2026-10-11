import { describe, expect, it } from "vitest";
import { LimitVehicles } from "../../src/application/limitVehicles";
import { SPEC } from "../../src/domain/vehicle/spec";
import { Vehicle } from "../../src/domain/vehicle/vehicle";
import { FakeFleetStore, FakeWorld, InMemoryRepo } from "./fakes";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);
const full = ids(SPEC.maxVehicles);

function setup() {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  const fleets = new FakeFleetStore();
  return { world, repo, fleets, uc: new LimitVehicles(world, repo, fleets) };
}

describe("LimitVehicles (ADR 0038)", () => {
  it("removes the oldest loaded vehicle when a new one spawns over the limit", () => {
    const { world, repo, fleets, uc } = setup();
    fleets.state = { order: full, evicted: [] };
    repo.save(Vehicle.create("v0", 0));
    world.loadedIds = [...full, "new"];
    uc.spawned("new");
    expect(world.calls).toEqual(["remove:v0"]);
    expect(repo.get("v0")).toBeUndefined();
    expect(fleets.state.order).toEqual([...full.slice(1), "new"]);
    expect(fleets.state.evicted).toEqual([]);
  });

  it("removes nothing else when several spawn in one tick before their events arrive", () => {
    const { world, fleets, uc } = setup();
    const cars = ids(SPEC.maxVehicles + 1);
    world.loadedIds = cars;
    for (const id of cars) uc.spawned(id);
    expect(world.calls).toEqual(["remove:v0"]);
    expect(fleets.state.order).toEqual(cars.slice(1));
  });

  it("removes an evicted vehicle in an unloaded chunk when its chunk loads", () => {
    const { world, fleets, uc } = setup();
    fleets.state = { order: full, evicted: [] };
    world.loadedIds = ["new"];
    uc.spawned("new");
    expect(world.calls).toEqual([]);
    expect(fleets.state.evicted).toEqual(["v0"]);

    world.loadedIds = ["new", "v0"];
    uc.found(["v0"]);
    expect(world.calls).toEqual(["remove:v0"]);
    expect(fleets.state.evicted).toEqual([]);
  });

  it("trims a world that already has more vehicles than the limit", () => {
    const { world, fleets, uc } = setup();
    world.loadedIds = ids(SPEC.maxVehicles + 3);
    uc.start();
    expect(world.calls).toHaveLength(3);
    expect(fleets.state.order).toHaveLength(SPEC.maxVehicles);
  });

  it("counts a vehicle it never saw spawn as older than the ones it did", () => {
    const { world, fleets, uc } = setup();
    fleets.state = { order: full, evicted: [] };
    world.loadedIds = [...full, "found"];
    uc.found(["found"]);
    expect(world.calls).toEqual(["remove:found"]);
    expect(fleets.state.order).toEqual(full);
  });

  it("does not save when it finds only known vehicles", () => {
    const { world, fleets, uc } = setup();
    fleets.state = { order: ["a"], evicted: [] };
    world.loadedIds = ["a"];
    uc.found(["a"]);
    expect(fleets.saves).toBe(0);
  });
});
