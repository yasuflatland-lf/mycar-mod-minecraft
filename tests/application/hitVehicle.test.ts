// tests/application/hitVehicle.test.ts
import { describe, expect, it } from "vitest";
import { HitVehicle } from "../../src/application/hitVehicle";
import { Vehicle } from "../../src/domain/vehicle/vehicle";
import { FakeWorld, InMemoryRepo } from "./fakes";

describe("HitVehicle (ADR 0008)", () => {
  it("3 回目でアイテムを落として車を消し、集約も捨てる", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    repo.save(Vehicle.create("a", 0));
    const uc = new HitVehicle(world, repo);
    expect([1, 2, 3].map((tick) => uc.execute({ vehicleId: "a", tick }))).toEqual([false, false, true]);
    expect(world.calls).toEqual(["drop:a", "remove:a"]);
    expect(repo.get("a")).toBeUndefined();
  });

  it("リポジトリにない車は何もしない", () => {
    const world = new FakeWorld();
    expect(new HitVehicle(world, new InMemoryRepo()).execute({ vehicleId: "x", tick: 0 })).toBe(false);
    expect(world.calls).toEqual([]);
  });
});
