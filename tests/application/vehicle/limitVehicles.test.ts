import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LimitVehicles } from "../../../src/application/vehicle/limitVehicles";
import { createVehicle } from "../../../src/domain/vehicle/registry";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { FakeFleetRepository, FakeWorld, InMemoryRepo } from "./fakes";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);
const full = ids(SPEC.maxVehicles);

function setup() {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  const fleets = new FakeFleetRepository();
  const warnings: string[] = [];
  const log = { warn: (m: string) => warnings.push(m) };
  return {
    world,
    repo,
    fleets,
    warnings,
    uc: new LimitVehicles(world, repo, fleets, log),
  };
}

describe("LimitVehicles (ADR 0038)", () => {
  it("removes the oldest loaded vehicle when a new one spawns over the limit", () => {
    const { world, repo, fleets, uc } = setup();
    fleets.state = { order: full, evicted: [] };
    repo.save(createVehicle("suv", "v0", 0));
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
    const { world, repo, fleets, uc } = setup();
    world.loadedIds = ids(SPEC.maxVehicles + 3);
    for (const id of world.loadedIds) repo.save(createVehicle("suv", id, 0));
    uc.start();
    // Within one scan a later id counts as older, so the last three go.
    const removed = world.loadedIds.slice(SPEC.maxVehicles);
    expect(world.calls).toEqual(removed.map((id) => `remove:${id}`));
    expect(removed.map((id) => repo.get(id))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(fleets.state.order).toHaveLength(SPEC.maxVehicles);
    expect(fleets.state.evicted).toEqual([]);
  });

  it("keeps removing the others and saves the fleet when one removal fails", () => {
    const { world, fleets, warnings, uc } = setup();
    const cars = ids(SPEC.maxVehicles + 2);
    fleets.state = { order: cars.slice(0, -1), evicted: [] };
    world.loadedIds = cars;
    world.failRemoveOn = "v0";
    uc.spawned(cars[cars.length - 1] as string);
    expect(world.calls).toEqual(["remove:v1"]);
    expect(fleets.state.evicted).toEqual(["v0"]);
    expect(warnings.some((w) => w.includes("v0"))).toBe(true);
    expect(warnings.some((w) => w.includes("v1"))).toBe(true);
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

  it("saves the vehicles it finds for the first time even when none is over the limit", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: SPEC.maxVehicles }), (n) => {
        const { world, fleets, uc } = setup();
        world.loadedIds = ids(n);
        uc.found(ids(n));
        expect(world.calls).toEqual([]);
        expect(fleets.saves).toBe(1);
        // Within one scan a later id counts as older.
        expect(fleets.state.order).toEqual(ids(n).reverse());
      }),
    );
  });
});
