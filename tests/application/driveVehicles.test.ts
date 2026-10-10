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
  it("読み込まれている車ごとに集約を作り、動きを反映する", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    world.snapshots = [snapshot("a", { yaw: 30 }), snapshot("b")];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(repo.ids().sort()).toEqual(["a", "b"]);
    expect(world.calls).toContain("motion:a:30");
  });

  it("リポジトリが空のまま動いている車 (再読み込み後) でも例外にならず、速度 0 から作り直す", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    world.snapshots = [snapshot("a", { velocity: { x: 0, z: 0.5 } })];
    expect(() => new DriveVehicles(world, repo, logger()).execute(0)).not.toThrow();
    expect(repo.get("a")!.speed).toBeLessThanOrEqual(0.0225);
  });

  it("読み込まれなくなった車の集約を捨てる", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    repo.save(Vehicle.create("gone", 0));
    world.snapshots = [snapshot("a")];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(repo.ids()).toEqual(["a"]);
  });

  it("1 台で例外が起きても、ほかの車は動かし、ログに残す", () => {
    const world = new FakeWorld();
    const log = logger();
    world.snapshots = [snapshot("bad"), snapshot("good")];
    world.failOn = "bad";
    new DriveVehicles(world, new InMemoryRepo(), log).execute(0);
    expect(world.calls).toContain("motion:good:0");
    expect(log.lines.some((l) => l.includes("bad"))).toBe(true);
  });

  it("運転席が空いたら、そのドアを鳴らす", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const uc = new DriveVehicles(world, repo, logger());
    const driver = { id: "d", offset: { x: -0.38, z: 0.35 }, yaw: 0, raw: { moveX: 0, moveY: 0, jump: false } };
    world.snapshots = [snapshot("a", { riders: [driver] })];
    uc.execute(0);
    world.snapshots = [snapshot("a")];
    uc.execute(1);
    expect(world.calls).toContain("door:a:door_fr");
  });
});
