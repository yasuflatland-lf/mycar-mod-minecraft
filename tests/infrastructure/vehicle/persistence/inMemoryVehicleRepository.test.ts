import { describe, expect, it } from "vitest";
import { createVehicle } from "../../../../src/domain/vehicle/kinds/index";
import { InMemoryVehicleRepository } from "../../../../src/infrastructure/vehicle/persistence/inMemoryVehicleRepository";

describe("InMemoryVehicleRepository", () => {
  it("saves, gets, deletes, and lists", () => {
    const repo = new InMemoryVehicleRepository();
    repo.save(createVehicle("suv", "a", 0));
    repo.save(createVehicle("suv", "b", 0));
    expect(repo.get("a")?.id).toBe("a");
    repo.remove("a");
    expect(repo.get("a")).toBeUndefined();
    expect(repo.ids()).toEqual(["b"]);
  });
});
