import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LimitVehicles } from "../../../src/application/vehicle/limitVehicles";
import {
  createVehicle,
  fleetLimitOf,
} from "../../../src/domain/vehicle/kinds/index";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { FakeFleetRepository, FakeWorld, InMemoryRepo } from "./fakes";

const entry = (id: string) => ({ id, kind: "suv" as const });
const entries = (ids: string[]) => ids.map(entry);

const ids = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);
const full = ids(SPEC.maxUnownedVehicles);

function setup() {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  const fleets = new FakeFleetRepository(fleetLimitOf);
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
    fleets.state = { order: entries(full), evicted: [] };
    repo.save(createVehicle("suv", "v0", 0));
    world.loaded = entries([...full, "new"]);
    uc.spawned(entry("new"));
    expect(world.calls).toEqual(["remove:v0"]);
    expect(repo.get("v0")).toBeUndefined();
    expect(fleets.state.order).toEqual(entries([...full.slice(1), "new"]));
    expect(fleets.state.evicted).toEqual([]);
  });

  it("removes nothing else when several spawn in one tick before their events arrive", () => {
    const { world, fleets, uc } = setup();
    const cars = ids(SPEC.maxUnownedVehicles + 1);
    world.loaded = entries(cars);
    for (const id of cars) uc.spawned(entry(id));
    expect(world.calls).toEqual(["remove:v0"]);
    expect(fleets.state.order).toEqual(entries(cars.slice(1)));
  });

  it("removes an evicted vehicle in an unloaded chunk when its chunk loads", () => {
    const { world, fleets, uc } = setup();
    fleets.state = { order: entries(full), evicted: [] };
    world.loaded = entries(["new"]);
    uc.spawned(entry("new"));
    expect(world.calls).toEqual([]);
    expect(fleets.state.evicted).toEqual(["v0"]);

    world.loaded = entries(["new", "v0"]);
    uc.found(entries(["v0"]));
    expect(world.calls).toEqual(["remove:v0"]);
    expect(fleets.state.evicted).toEqual([]);
  });

  it("trims a world that already has more vehicles than the limit", () => {
    const { world, repo, fleets, uc } = setup();
    world.loaded = entries(ids(SPEC.maxUnownedVehicles + 3));
    for (const { id } of world.loaded) repo.save(createVehicle("suv", id, 0));
    uc.start();
    // Within one scan a later id counts as older, so the last three go.
    const removed = world.loaded
      .slice(SPEC.maxUnownedVehicles)
      .map((entry) => entry.id);
    expect(world.calls).toEqual(removed.map((id) => `remove:${id}`));
    expect(removed.map((id) => repo.get(id))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(fleets.state.order).toHaveLength(SPEC.maxUnownedVehicles);
    expect(fleets.state.evicted).toEqual([]);
  });

  it("keeps removing the others and saves the fleet when one removal fails", () => {
    const { world, fleets, warnings, uc } = setup();
    const cars = ids(SPEC.maxUnownedVehicles + 2);
    fleets.state = { order: entries(cars.slice(0, -1)), evicted: [] };
    world.loaded = entries(cars);
    world.failRemoveOn = "v0";
    uc.spawned(entry(cars[cars.length - 1] as string));
    expect(world.calls).toEqual(["remove:v1"]);
    expect(fleets.state.evicted).toEqual(["v0"]);
    expect(warnings.some((w) => w.includes("v0"))).toBe(true);
    expect(warnings.some((w) => w.includes("v1"))).toBe(true);
  });

  it("counts a vehicle it never saw spawn as older than the ones it did", () => {
    const { world, fleets, uc } = setup();
    fleets.state = { order: entries(full), evicted: [] };
    world.loaded = entries([...full, "found"]);
    uc.found(entries(["found"]));
    expect(world.calls).toEqual(["remove:found"]);
    expect(fleets.state.order).toEqual(entries(full));
  });

  it("does not save when it finds only known vehicles", () => {
    const { world, fleets, uc } = setup();
    fleets.state = { order: entries(["a"]), evicted: [] };
    world.loaded = entries(["a"]);
    uc.found(entries(["a"]));
    expect(fleets.saves).toBe(0);
  });

  it("saves the vehicles it finds for the first time even when none is over the limit", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: SPEC.maxUnownedVehicles }), (n) => {
        const { world, fleets, uc } = setup();
        world.loaded = entries(ids(n));
        uc.found(entries(ids(n)));
        expect(world.calls).toEqual([]);
        expect(fleets.saves).toBe(1);
        // Within one scan a later id counts as older.
        expect(fleets.state.order).toEqual(entries(ids(n).reverse()));
      }),
    );
  });
  it("removes the loaded first boat when its owner spawns a second, leaving other owners and kinds alone", () => {
    const { world, repo, fleets, warnings, uc } = setup();
    const first = { id: "first", kind: "sportsboat" as const, owner: "a" };
    const second = { id: "second", kind: "sportsboat" as const, owner: "a" };
    const other = { id: "other", kind: "sportsboat" as const, owner: "b" };
    const suv = { id: "suv", kind: "suv" as const, owner: "a" };
    fleets.state = { order: [first, other, suv], evicted: [] };
    world.loaded = [first, other, suv, second];
    for (const e of world.loaded) repo.save(createVehicle(e.kind, e.id, 0));
    uc.spawned(second);
    expect(world.calls).toEqual(["remove:first"]);
    expect(repo.get(first.id)).toBeUndefined();
    for (const e of [other, suv, second]) expect(repo.get(e.id)).toBeDefined();
    expect(fleets.state).toEqual({ order: [other, suv, second], evicted: [] });
    expect(warnings).toEqual(["first: removed, over the limit"]);
  });
});
