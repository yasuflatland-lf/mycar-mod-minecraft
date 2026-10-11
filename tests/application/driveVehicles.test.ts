import { describe, expect, it } from "vitest";
import { DriveVehicles } from "../../src/application/driveVehicles";
import type { RawInput } from "../../src/domain/vehicle/driveInput";
import { headlightCells } from "../../src/domain/vehicle/headlights";
import { Vehicle } from "../../src/domain/vehicle/vehicle";
import { FakeWorld, InMemoryRepo, snapshot } from "./fakes";

const logger = () => {
  const lines: string[] = [];
  return { lines, warn: (m: string) => lines.push(m) };
};

const FULL_THROTTLE: RawInput = { moveX: 0, moveY: 1, jump: false };

// Accelerates vehicle "a" (heading +z) toward a target 1 block ahead, feeding
// back the velocity the engine would report, until the speed passes the ram
// threshold, then returns the damage calls the world received.
function ramAhead(over: Parameters<typeof snapshot>[1]): string[] {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  const uc = new DriveVehicles(world, repo, logger());
  world.targets = [
    { id: "cow", offset: { x: 0, y: 0, z: 1 }, protectedOccupant: false },
  ];
  for (let tick = 0; tick < 200; tick++) {
    const speed = repo.get("a")?.speed ?? 0;
    world.snapshots = [
      snapshot("a", { ...over, velocity: { x: 0, z: speed } }),
    ];
    uc.execute(tick);
  }
  return world.calls.filter((c) => c.startsWith("damage:"));
}

describe("DriveVehicles", () => {
  it("forwards ram hits to the world with the driver as the attacker", () => {
    const driver = {
      id: "d",
      offset: { x: -0.38, z: 0.35 },
      yaw: 0,
      raw: FULL_THROTTLE,
    };
    const damage = ramAhead({ riders: [driver] });
    expect(damage.length).toBeGreaterThan(0);
    expect(damage.every((c) => c === "damage:cow:d")).toBe(true);
  });

  it("forwards ram hits without an attacker when test input drives the vehicle", () => {
    const damage = ramAhead({ testInput: FULL_THROTTLE });
    expect(damage.length).toBeGreaterThan(0);
    expect(damage.every((c) => c === "damage:cow:-")).toBe(true);
  });

  it("creates an aggregate for each loaded vehicle and applies its motion", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    world.snapshots = [snapshot("a", { yaw: 30 }), snapshot("b")];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(repo.ids().sort()).toEqual(["a", "b"]);
    expect(world.calls).toContain("motion:a:30");
  });

  it("keeps the entity's heading when it rebuilds a driven vehicle after a reload", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const driver = {
      id: "d",
      offset: { x: -0.38, z: 0.35 },
      yaw: 75,
      raw: { moveX: 0, moveY: 0, jump: false },
    };
    world.snapshots = [snapshot("a", { yaw: 10, riders: [driver] })];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(repo.get("a")?.yaw).toBeCloseTo(10);
    expect(world.calls).toContain("motion:a:10");
  });

  it("does not throw for a moving vehicle missing from the repository (after a reload) and rebuilds it from zero speed", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    world.snapshots = [snapshot("a", { velocity: { x: 0, z: 0.5 } })];
    expect(() =>
      new DriveVehicles(world, repo, logger()).execute(0),
    ).not.toThrow();
    expect(repo.get("a")?.speed).toBeLessThanOrEqual(0.0225);
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

  it("rebuilds a vehicle lost in a reload in the flight mode stored on the entity (ADR 0021)", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    world.snapshots = [
      snapshot("a", {
        flight: "flying",
        onGround: false,
        testInput: FULL_THROTTLE,
      }),
    ];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(repo.get("a")?.flightMode).toBe("flying");
    expect(world.calls.some((c) => c.startsWith("flight:"))).toBe(false);
  });

  it("writes the flight mode to the world only on the tick it changes (ADR 0021)", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    const idle = { moveX: 0, moveY: 0, jump: false };
    const pressed = { ...idle, jump: true };
    [pressed, idle, pressed, idle, idle].forEach((input, tick) => {
      world.snapshots = [snapshot("a", { testInput: input })];
      uc.execute(tick);
    });
    expect(world.calls.filter((c) => c.startsWith("flight:"))).toEqual([
      "flight:a:takeoff",
    ]);
  });

  it("writes the bank angle on the first tick and then only when it changes (ADR 0026)", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    for (let tick = 0; tick < 3; tick++) {
      world.snapshots = [snapshot("a", { testInput: FULL_THROTTLE })];
      uc.execute(tick);
    }
    expect(world.calls.filter((c) => c.startsWith("bank:"))).toEqual([
      "bank:a:0",
    ]);
  });

  it("still writes a flight mode change when moving the vehicle throws on that tick", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    const idle = { moveX: 0, moveY: 0, jump: false };
    const pressed = { ...idle, jump: true };
    world.failOn = "a";
    [pressed, idle, pressed].forEach((input, tick) => {
      world.snapshots = [snapshot("a", { testInput: input })];
      uc.execute(tick);
    });
    expect(world.calls).toContain("flight:a:takeoff");
  });

  it("lights the cells ahead of a vehicle with its headlights on, and none for one with them off", () => {
    const world = new FakeWorld();
    const location = { x: 10.5, y: 64, z: -3.2 };
    world.snapshots = [
      snapshot("on", { location, yaw: 30, headlights: true }),
      snapshot("off", { location, yaw: 30 }),
    ];
    new DriveVehicles(world, new InMemoryRepo(), logger()).execute(0);
    expect(world.shone.get("on")).toEqual(headlightCells(location, 30));
    expect(world.shone.get("off")).toEqual([]);
  });

  it("clears the lights of a vehicle that is no longer loaded", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    repo.save(Vehicle.create("gone", 0));
    world.shone.set("gone", [{ x: 0, y: 0, z: 4 }]);
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(world.shone.get("gone")).toEqual([]);
  });
});

describe("DriveVehicles third-person camera in flight (ADR 0028)", () => {
  const rider = (id: string) => ({
    id,
    offset: { x: -0.38, z: 0.35 },
    yaw: 0,
    raw: { moveX: 0, moveY: 0, jump: false },
  });
  const cameraCalls = (world: FakeWorld) =>
    world.calls.filter((c) => c.startsWith("camera:"));

  it("switches riders of a flying vehicle to third person once, and back when they get off", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    const flying = { flight: "flying" as const, onGround: false };
    world.snapshots = [snapshot("a", { ...flying, riders: [rider("p")] })];
    uc.execute(0);
    uc.execute(1);
    world.snapshots = [snapshot("a", { ...flying, testInput: FULL_THROTTLE })];
    uc.execute(2);
    uc.execute(3);
    expect(cameraCalls(world)).toEqual(["camera:p:third", "camera:p:own"]);
  });

  it("gives the view back when the vehicle lands", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const uc = new DriveVehicles(world, repo, logger());
    const idle = { moveX: 0, moveY: 0, jump: false };
    const pressed = { ...idle, jump: true };
    const tapTwice = [pressed, idle, pressed, idle];
    let tick = 0;
    const drive = (input: RawInput, onGround: boolean) => {
      world.snapshots = [
        snapshot("a", {
          onGround,
          riders: [{ ...rider("p"), raw: input }],
        }),
      ];
      uc.execute(tick++);
    };
    for (const input of tapTwice) drive(input, true);
    expect(repo.get("a")?.flightMode).toBe("takeoff");
    while (repo.get("a")?.flightMode !== "flying") drive(idle, false);
    for (const input of tapTwice) drive(input, false);
    expect(repo.get("a")?.flightMode).toBe("landing");
    drive(idle, true);
    expect(repo.get("a")?.flightMode).toBe("ground");
    expect(cameraCalls(world)).toEqual(["camera:p:third", "camera:p:own"]);
  });

  it("leaves riders of a vehicle on the ground with their own view", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    world.snapshots = [snapshot("a", { riders: [rider("p")] })];
    uc.execute(0);
    expect(cameraCalls(world)).toEqual([]);
  });

  it("logs a camera failure without stopping the vehicles, and retries on the next tick", () => {
    const world = new FakeWorld();
    const log = logger();
    const uc = new DriveVehicles(world, new InMemoryRepo(), log);
    world.failCameraOn = "p";
    world.snapshots = [
      snapshot("a", {
        flight: "flying",
        onGround: false,
        riders: [rider("p")],
      }),
    ];
    uc.execute(0);
    expect(log.lines.some((l) => l.includes("camera p"))).toBe(true);
    expect(world.calls.some((c) => c.startsWith("motion:a"))).toBe(true);
    world.failCameraOn = undefined;
    uc.execute(1);
    expect(cameraCalls(world)).toEqual(["camera:p:third"]);
  });
});
