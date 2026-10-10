// tests/application/placeVehicle.test.ts
import { describe, expect, it } from "vitest";
import { PlaceVehicle } from "../../src/application/placeVehicle";
import { FakeWorld, InMemoryRepo } from "./fakes";

const cmd = { playerId: "p", dimensionId: "minecraft:overworld", blockLocation: { x: 10, y: 64, z: -3 }, yaw: 45, creative: false };

describe("PlaceVehicle (ADR 0008)", () => {
  it("ブロックの上に車を出し、集約を保存し、アイテムを 1 つ減らす", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    expect(new PlaceVehicle(world, repo).execute(cmd)).toBe(true);
    expect(world.calls).toEqual(["spawn:minecraft:overworld:10.5,65,-2.5:45", "consume:p"]);
    expect(repo.get("v1")!.yaw).toBeCloseTo(45);
  });

  it("クリエイティブではアイテムを減らさない", () => {
    const world = new FakeWorld();
    new PlaceVehicle(world, new InMemoryRepo()).execute({ ...cmd, creative: true });
    expect(world.calls.some((c) => c.startsWith("consume"))).toBe(false);
  });

  it("天井が低いなど空間がなければ、車を出さずアイテムも減らさない", () => {
    const world = new FakeWorld();
    world.air = (at) => !(at.y === 66 && at.x === 10 && at.z === -3);
    expect(new PlaceVehicle(world, new InMemoryRepo()).execute(cmd)).toBe(false);
    expect(world.calls).toEqual([]);
  });
});
