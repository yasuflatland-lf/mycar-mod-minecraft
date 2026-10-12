import { describe, expect, it } from "vitest";
import { SwitchHeadlights } from "../../../src/application/vehicle/switchHeadlights";
import { rebuildVehicle } from "../../../src/domain/vehicle/kinds/index";
import { SPEC } from "../../../src/domain/vehicle/spec";
import type { RiderView } from "../../../src/domain/vehicle/vehicle";
import { FakeWorld, InMemoryRepo } from "./fakes";

// Seat positions of the driver (0) and front passenger (1) with the vehicle heading +z.
const SEAT_OFFSETS = [
  { x: -0.38, z: 0.35 },
  { x: 0.38, z: 0.35 },
] as const;

const rider = (id: string, seat: 0 | 1): RiderView => ({
  id,
  offset: SEAT_OFFSETS[seat],
  yaw: 0,
  raw: { moveX: 0, moveY: 0, jump: false },
});

function setup() {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  repo.save(rebuildVehicle("suv", "a", 0, [rider("d", 0), rider("p", 1)], {}));
  world.headlights.set("a", false);
  return { world, uc: new SwitchHeadlights(world, repo) };
}

describe("SwitchHeadlights (ADR 0020)", () => {
  it("the driver turns the headlights on and off again", () => {
    const { world, uc } = setup();
    expect(uc.execute({ playerId: "d", vehicleId: "a", tick: 0 })).toBe(true);
    expect(world.headlights.get("a")).toBe(true);
    const later = SPEC.headlightSwitchCooldown;
    expect(uc.execute({ playerId: "d", vehicleId: "a", tick: later })).toBe(
      true,
    );
    expect(world.headlights.get("a")).toBe(false);
  });

  it("a passenger cannot switch them", () => {
    const { world, uc } = setup();
    expect(uc.execute({ playerId: "p", vehicleId: "a", tick: 0 })).toBe(false);
    expect(world.calls).toEqual([]);
  });

  it("one tap that arrives twice switches only once", () => {
    const { world, uc } = setup();
    uc.execute({ playerId: "d", vehicleId: "a", tick: 0 });
    uc.execute({ playerId: "d", vehicleId: "a", tick: 1 });
    expect(world.calls).toEqual(["headlights:a:true"]);
  });

  it("a held touch that repeats the use switches only once", () => {
    const { world, uc } = setup();
    for (const tick of [0, 4, 8, 13, 17, 21]) {
      uc.execute({ playerId: "d", vehicleId: "a", tick });
    }
    expect(world.calls).toEqual(["headlights:a:true"]);
  });

  it("does nothing for a vehicle that is not loaded or no longer exists", () => {
    const { world, uc } = setup();
    expect(uc.execute({ playerId: "d", vehicleId: "b", tick: 0 })).toBe(false);
    world.headlights.delete("a");
    expect(uc.execute({ playerId: "d", vehicleId: "a", tick: 0 })).toBe(false);
    expect(world.calls).toEqual([]);
  });
});
