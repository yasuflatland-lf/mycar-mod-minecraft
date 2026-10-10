// tests/application/driveVehicles.test.ts
import { describe, expect, it } from "vitest";
import { DriveVehicles } from "../../src/application/driveVehicles";
import { Vehicle } from "../../src/domain/vehicle/vehicle";
import { FakeWorld, InMemoryRepo, snapshot } from "./fakes";

const logger = () => {
  const lines: string[] = [];
  return { lines, warn: (m: string) => lines.push(m) };
};

describe("DriveVehicles", () => {
  it("creates an aggregate for each loaded vehicle and applies its motion", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    world.snapshots = [snapshot("a", { yaw: 30 }), snapshot("b")];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(repo.ids().sort()).toEqual(["a", "b"]);
    expect(world.calls).toContain("motion:a:30");
  });

  it("does not throw for a moving vehicle missing from the repository (after a reload) and rebuilds it from zero speed", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    world.snapshots = [snapshot("a", { velocity: { x: 0, z: 0.5 } })];
    expect(() =>
      new DriveVehicles(world, repo, logger()).execute(0),
    ).not.toThrow();
    expect(repo.get("a")!.speed).toBeLessThanOrEqual(0.0225);
  });

  it("discards the aggregates of vehicles that are no longer loaded", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    repo.save(Vehicle.create("gone", 0));
    world.snapshots = [snapshot("a")];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(repo.ids()).toEqual(["a"]);
  });

  it("keeps moving the other vehicles and logs the error when one vehicle throws", () => {
    const world = new FakeWorld();
    const log = logger();
    world.snapshots = [snapshot("bad"), snapshot("good")];
    world.failOn = "bad";
    new DriveVehicles(world, new InMemoryRepo(), log).execute(0);
    expect(world.calls).toContain("motion:good:0");
    expect(log.lines.some((l) => l.includes("bad"))).toBe(true);
  });

  it("plays that seat's door sound when the driver's seat becomes empty", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const uc = new DriveVehicles(world, repo, logger());
    const driver = {
      id: "d",
      offset: { x: -0.38, z: 0.35 },
      yaw: 0,
      raw: { moveX: 0, moveY: 0, jump: false },
    };
    world.snapshots = [snapshot("a", { riders: [driver] })];
    uc.execute(0);
    world.snapshots = [snapshot("a")];
    uc.execute(1);
    expect(world.calls).toContain("door:a:door_fr");
  });
});
