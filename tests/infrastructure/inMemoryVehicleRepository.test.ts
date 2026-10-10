// tests/infrastructure/inMemoryVehicleRepository.test.ts
import { describe, expect, it } from "vitest";
import { Vehicle } from "../../src/domain/vehicle/vehicle";
import { InMemoryVehicleRepository } from "../../src/infrastructure/persistence/inMemoryVehicleRepository";

describe("InMemoryVehicleRepository", () => {
  it("保存・取得・削除・一覧", () => {
    const repo = new InMemoryVehicleRepository();
    repo.save(Vehicle.create("a", 0));
    repo.save(Vehicle.create("b", 0));
    expect(repo.get("a")?.id).toBe("a");
    repo.remove("a");
    expect(repo.get("a")).toBeUndefined();
    expect(repo.ids()).toEqual(["b"]);
  });
});
