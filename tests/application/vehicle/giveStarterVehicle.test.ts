import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GiveStarterVehicle } from "../../../src/application/vehicle/giveStarterVehicle";
import { FakeWorld } from "./fakes";

describe("GiveStarterVehicle (ADR 0023)", () => {
  it("gives one item per player, however many times they join", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("a", "b", "c"), { maxLength: 20 }),
        (joins) => {
          const world = new FakeWorld();
          for (const id of joins) world.starters.set(id, false);
          const give = new GiveStarterVehicle(world);
          for (const id of joins) give.execute(id);
          const players = [...new Set(joins)];
          expect(world.calls.filter((c) => c.startsWith("give:"))).toEqual(
            players.map((id) => `give:${id}:suv`),
          );
          for (const id of players) expect(world.starters.get(id)).toBe(true);
        },
      ),
    );
  });

  it("marks the player only after giving the item", () => {
    const world = new FakeWorld();
    world.starters.set("p", false);
    expect(new GiveStarterVehicle(world).execute("p")).toBe(true);
    expect(world.calls).toEqual(["give:p:suv", "mark:p"]);
  });

  it("does nothing for a player who already received it, or who left", () => {
    const world = new FakeWorld();
    world.starters.set("p", true);
    const give = new GiveStarterVehicle(world);
    expect(give.execute("p")).toBe(false);
    expect(give.execute("gone")).toBe(false);
    expect(world.calls).toEqual([]);
  });
});
