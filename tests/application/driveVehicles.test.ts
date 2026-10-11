import { describe, expect, it } from "vitest";
import { DriveVehicles } from "../../src/application/driveVehicles";
import { forward } from "../../src/domain/shared/vec";
import type { RawInput } from "../../src/domain/vehicle/driveInput";
import { headlightCells } from "../../src/domain/vehicle/headlights";
import { SPEC } from "../../src/domain/vehicle/spec";
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

  it("rebuilds a vehicle lost in a reload in the vehicle form stored on the entity (ADR 0021)", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    world.snapshots = [
      snapshot("a", {
        form: "hover",
        onGround: false,
        testInput: FULL_THROTTLE,
      }),
    ];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(repo.get("a")?.form).toBe("hover");
    expect(world.calls.some((c) => c.startsWith("form:"))).toBe(false);
  });

  it("writes the vehicle form to the world only on the tick it changes (ADR 0021)", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    const idle = { moveX: 0, moveY: 0, jump: false };
    const pressed = { ...idle, jump: true };
    [pressed, idle, pressed, idle, idle].forEach((input, tick) => {
      world.snapshots = [snapshot("a", { testInput: input })];
      uc.execute(tick);
    });
    expect(world.calls.filter((c) => c.startsWith("form:"))).toEqual([
      "form:a:takeoff",
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

  it("writes the landing gear on the first tick and then only when it changes (ADR 0033)", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    const idle = { moveX: 0, moveY: 0, jump: false };
    const pressed = { ...idle, jump: true };
    [idle, idle, pressed, idle, pressed, idle].forEach((input, tick) => {
      world.snapshots = [snapshot("a", { testInput: input })];
      uc.execute(tick);
    });
    expect(world.calls.filter((c) => c.startsWith("gear:"))).toEqual([
      "gear:a:down",
      "gear:a:up",
    ]);
  });

  it("still writes a vehicle form change when moving the vehicle throws on that tick", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    const idle = { moveX: 0, moveY: 0, jump: false };
    const pressed = { ...idle, jump: true };
    world.failOn = "a";
    [pressed, idle, pressed].forEach((input, tick) => {
      world.snapshots = [snapshot("a", { testInput: input })];
      uc.execute(tick);
    });
    expect(world.calls).toContain("form:a:takeoff");
  });

  it("still writes the bank angle when moving the vehicle throws on that tick (ADR 0026)", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    world.failOn = "a";
    world.snapshots = [snapshot("a", { testInput: FULL_THROTTLE })];
    uc.execute(0);
    expect(world.calls).toContain("bank:a:0");
  });

  it("writes the bank of a turn in flight as it builds, and nothing more once it holds (ADR 0026)", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const uc = new DriveVehicles(world, repo, logger());
    const right: RawInput = { moveX: -1, moveY: 1, jump: false };
    const bankCalls = () => world.calls.filter((c) => c.startsWith("bank:"));
    const fly = (ticks: number) => {
      for (let i = 0; i < ticks; i++) {
        // Feed back the velocity the engine would report for the heading and speed.
        const v = repo.get("a");
        const f = forward(v?.yaw ?? 0);
        const speed = (v?.speed ?? 0) * SPEC.flightDrag;
        world.snapshots = [
          snapshot("a", {
            form: "hover",
            onGround: false,
            yaw: v?.yaw ?? 0,
            velocity: { x: f.x * speed, z: f.z * speed },
            testInput: right,
          }),
        ];
        uc.execute(i);
      }
    };
    fly(60);
    const angle = repo.get("a")?.bankAngle;
    expect(angle).toBe(SPEC.maxBank);
    expect(bankCalls().at(-1)).toBe(`bank:a:${angle}`);
    const before = bankCalls().length;
    fly(20);
    expect(bankCalls()).toHaveLength(before);
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
    const flying = { form: "hover" as const, onGround: false };
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
    expect(repo.get("a")?.form).toBe("takeoff");
    // Takeoff and landing count as off the ground (ADR 0028).
    expect(cameraCalls(world)).toEqual(["camera:p:third"]);
    while (repo.get("a")?.form !== "hover") drive(idle, false);
    for (const input of tapTwice) drive(input, false);
    expect(repo.get("a")?.form).toBe("landing");
    expect(cameraCalls(world)).toEqual(["camera:p:third"]);
    drive(idle, true);
    expect(repo.get("a")?.form).toBe("car");
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
        form: "hover",
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

  it("logs a camera that keeps failing once, not every tick", () => {
    const world = new FakeWorld();
    const log = logger();
    const uc = new DriveVehicles(world, new InMemoryRepo(), log);
    world.failCameraOn = "p";
    world.snapshots = [
      snapshot("a", {
        form: "hover",
        onGround: false,
        riders: [rider("p")],
      }),
    ];
    for (let tick = 0; tick < 5; tick++) uc.execute(tick);
    expect(log.lines.filter((l) => l.includes("camera p"))).toHaveLength(1);
  });

  it("retries giving the view back when it fails", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    world.snapshots = [
      snapshot("a", {
        form: "hover",
        onGround: false,
        riders: [rider("p")],
      }),
    ];
    uc.execute(0);
    world.snapshots = [snapshot("a", { form: "hover", onGround: false })];
    world.failCameraOn = "p";
    uc.execute(1);
    world.failCameraOn = undefined;
    uc.execute(2);
    uc.execute(3);
    expect(cameraCalls(world)).toEqual(["camera:p:third", "camera:p:own"]);
  });
});

describe("DriveVehicles submarine riders (ADR 0040)", () => {
  const rider = (id: string) => ({
    id,
    offset: { x: -0.38, z: 0.35 },
    yaw: 0,
    raw: { moveX: 0, moveY: 0, jump: false },
  });
  const breathing = (id: string) =>
    `breathing:${id}:${SPEC.waterBreathingTicks}`;
  const breathingCalls = (world: FakeWorld) =>
    world.calls.filter((c) => c.startsWith("breathing:"));

  it("senses submersion and refreshes every rider's breathing only every second", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const uc = new DriveVehicles(world, repo, logger());
    world.snapshots = [
      snapshot("a", {
        waterDepth: SPEC.carHeight,
        riders: [rider("driver"), rider("passenger")],
      }),
    ];
    uc.execute(0);
    expect(repo.get("a")?.form).toBe("submarine");
    expect(world.calls).toContain("form:a:submarine");
    expect(breathingCalls(world)).toEqual([
      breathing("driver"),
      breathing("passenger"),
    ]);
    for (let tick = 1; tick < SPEC.waterBreathingInterval; tick++)
      uc.execute(tick);
    expect(breathingCalls(world)).toHaveLength(2);
    uc.execute(SPEC.waterBreathingInterval);
    expect(breathingCalls(world)).toEqual([
      breathing("driver"),
      breathing("passenger"),
      breathing("driver"),
      breathing("passenger"),
    ]);
  });

  it("does not give breathing to car or hover riders", () => {
    const world = new FakeWorld();
    world.snapshots = [
      snapshot("car", { riders: [rider("c")] }),
      snapshot("hover", {
        form: "hover",
        onGround: false,
        riders: [rider("h")],
      }),
    ];
    new DriveVehicles(world, new InMemoryRepo(), logger()).execute(20);
    expect(breathingCalls(world)).toEqual([]);
  });

  it("logs a failed breathing call and still refreshes the other riders", () => {
    const world = new FakeWorld();
    const log = logger();
    world.failBreathingOn = "bad";
    world.snapshots = [
      snapshot("a", {
        waterDepth: SPEC.carHeight,
        riders: [rider("bad"), rider("good")],
      }),
      snapshot("b", { waterDepth: SPEC.carHeight, riders: [rider("other")] }),
    ];
    new DriveVehicles(world, new InMemoryRepo(), log).execute(20);
    expect(breathingCalls(world)).toEqual([
      breathing("good"),
      breathing("other"),
    ]);
    expect(log.lines.some((line) => line.includes("breathing bad"))).toBe(true);
  });

  it("switches submarine riders to third person and restores their view and stops breathing on shore", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    world.snapshots = [
      snapshot("a", {
        form: "submarine",
        waterDepth: SPEC.carHeight,
        riders: [rider("p")],
      }),
    ];
    uc.execute(0);
    uc.execute(1);
    world.snapshots = [snapshot("a", { riders: [rider("p")] })];
    uc.execute(20);
    expect(world.calls.filter((c) => c.startsWith("camera:"))).toEqual([
      "camera:p:third",
      "camera:p:own",
    ]);
    expect(world.calls).toContain("form:a:car");
    expect(breathingCalls(world)).toEqual([breathing("p")]);
  });

  it("stops refreshing breathing once a rider leaves", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    world.snapshots = [
      snapshot("a", { waterDepth: SPEC.carHeight, riders: [rider("p")] }),
    ];
    uc.execute(0);
    world.snapshots = [snapshot("a", { waterDepth: SPEC.carHeight })];
    uc.execute(20);
    expect(breathingCalls(world)).toEqual([breathing("p")]);
    expect(world.calls).toContain("camera:p:own");
  });
});
