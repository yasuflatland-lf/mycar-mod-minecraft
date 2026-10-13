import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { DriveVehicles } from "../../../src/application/vehicle/driveVehicles";
import { forward } from "../../../src/domain/shared/vec";
import type { Drive, DriveStep } from "../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../src/domain/vehicle/driveInput";
import { headlightCells } from "../../../src/domain/vehicle/headlights";
import {
  createVehicle,
  rebuildVehicle,
} from "../../../src/domain/vehicle/kinds/index";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../../src/domain/vehicle/kinds/suv/spec";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { Vehicle } from "../../../src/domain/vehicle/vehicle";
import { defined } from "../../support/defined";
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
      snapshot("a", { ...over, velocity: { x: 0, y: 0, z: speed } }),
    ];
    uc.execute(tick);
  }
  return world.calls.filter((c) => c.startsWith("damage:"));
}

describe("DriveVehicles", () => {
  it("holds a vehicle and lays its requested floor instead of applying motion", () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.integer(),
          y: fc.integer({ min: -64, max: 300 }),
          z: fc.integer(),
          yaw: fc.integer({ min: -180, max: 180 }),
        }),
        fc.array(
          fc.record({
            x: fc.integer(),
            y: fc.integer(),
            z: fc.integer(),
            height: fc.integer({ min: 1, max: 16 }),
          }),
        ),
        (hold, floor) => {
          const step: DriveStep = {
            dock: { hold, floor, seats: [] },
            impulse: { x: 0, y: 0, z: 1 },
            forward: { x: 0, z: 1 },
            commands: [],
            riders: { thirdPerson: false, underwater: false },
          };
          const drive: Drive = {
            speed: 0,
            yaw: hold.yaw,
            onDriverMounted: () => {},
            onSeatVacated: () => [],
            step: () => step,
          };
          const world = new FakeWorld();
          const repo = new InMemoryRepo();
          repo.save(new Vehicle("held", SUV_PROFILE, drive));
          world.snapshots = [snapshot("held")];
          new DriveVehicles(world, repo, logger()).execute(0);
          expect(world.held.get("held")).toEqual(hold);
          expect(world.floors.get("held")).toEqual(floor);
          expect(world.calls.some((c) => c.startsWith("motion:held:"))).toBe(
            false,
          );
        },
      ),
    );
  });

  it("releases the hold and clears the floor when the drive does not request them", () => {
    const world = new FakeWorld();
    world.snapshots = [snapshot("a")];
    const holdAt = vi.spyOn(world, "holdAt");
    const layFloor = vi.spyOn(world, "layFloor");
    new DriveVehicles(world, new InMemoryRepo(), logger()).execute(0);
    expect(holdAt).toHaveBeenCalledWith("a", undefined);
    expect(layFloor).toHaveBeenCalledWith("a", []);
    expect(world.calls).toContain("motion:a:0");
  });

  it.each(["shineHeadlights", "layFloor", "holdAt", "keepDeckSeats"] as const)(
    "clears all resources of a disappeared vehicle even when %s fails",
    (failed) => {
      const world = new FakeWorld();
      const repo = new InMemoryRepo();
      repo.save(createVehicle("suv", "gone", 0));
      const log = logger();
      const shine = vi.spyOn(world, "shineHeadlights");
      const floor = vi.spyOn(world, "layFloor");
      const hold = vi.spyOn(world, "holdAt");
      const seats = vi.spyOn(world, "keepDeckSeats");
      vi.spyOn(world, failed).mockImplementation(() => {
        throw new Error("cleanup");
      });
      new DriveVehicles(world, repo, log).execute(0);
      expect(shine).toHaveBeenCalledWith("gone", []);
      expect(floor).toHaveBeenCalledWith("gone", []);
      expect(hold).toHaveBeenCalledWith("gone", undefined);
      expect(seats).toHaveBeenCalledWith("gone", [], 0);
      expect(log.lines).toEqual(["gone: Error: cleanup"]);
      expect(repo.ids()).toEqual([]);
    },
  );

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
    world.snapshots = [snapshot("a", { velocity: { x: 0, y: 0, z: 0.5 } })];
    expect(() =>
      new DriveVehicles(world, repo, logger()).execute(0),
    ).not.toThrow();
    expect(repo.get("a")?.speed).toBeLessThanOrEqual(0.0225);
  });

  it("discards the aggregates of vehicles that are no longer loaded", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    repo.save(createVehicle("suv", "gone", 0));
    world.snapshots = [snapshot("a")];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(repo.ids()).toEqual(["a"]);
    expect(world.floors.get("gone")).toEqual([]);
    expect(world.held.has("gone")).toBe(true);
    expect(world.held.get("gone")).toBeUndefined();
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

  it.each(["bank", "gear_down"])(
    "skips the rest of a vehicle's tick when its %s command throws, while other vehicles continue (ADR 0055)",
    (name) => {
      const world = new FakeWorld();
      const repo = new InMemoryRepo();
      const log = logger();
      const driver = {
        id: "driver",
        offset: defined(SUV_PROFILE.seats.positions[0], "driver seat"),
        yaw: 0,
        raw: FULL_THROTTLE,
      };
      const passenger = {
        ...driver,
        id: "passenger",
        offset: defined(SUV_PROFILE.seats.positions[1], "passenger seat"),
      };
      repo.save(
        rebuildVehicle("suv", "bad", 0, [driver, passenger], {
          form: "submarine",
        }),
      );
      world.snapshots = [
        snapshot("bad", {
          waterDepth: SUV_SPEC.carHeight,
          riders: [driver],
          headlights: true,
        }),
        snapshot("good", {
          waterDepth: SUV_SPEC.carHeight,
          riders: [{ ...driver, id: "other" }],
          headlights: true,
        }),
      ];
      world.failRunOn = { id: "bad", name };
      const run = vi.spyOn(world, "run");
      new DriveVehicles(world, repo, log).execute(0);
      expect(run.mock.calls.filter(([id]) => id === "bad")).toHaveLength(1);
      expect(
        world.calls.some(
          (c) =>
            c.startsWith("motion:bad:") ||
            c.startsWith("door:bad:") ||
            c.startsWith("camera:driver:") ||
            c.startsWith("breathing:driver:"),
        ),
      ).toBe(false);
      expect(world.shone.has("bad")).toBe(false);
      expect(log.lines).toEqual([`bad: Error: command ${name}`]);
      expect(world.calls).toContain("motion:good:0");
      expect(world.calls).toContain("camera:other:third");
      expect(world.calls).toContain(
        `breathing:other:${SPEC.waterBreathingTicks}`,
      );
      expect(world.shone.get("good")?.length).toBeGreaterThan(0);
    },
  );

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
        restored: () => ({ form: "hover" }),
        onGround: false,
        testInput: FULL_THROTTLE,
      }),
    ];
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(world.formOf("a")).toBe("hover");
    // A drive rebuilt in car form would send its gear down on the first tick.
    expect(world.calls).toContain("gear:a:up");
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
        const speed = (v?.speed ?? 0) * SUV_SPEC.flightDrag;
        world.snapshots = [
          snapshot("a", {
            restored: () => ({ form: "hover" }),
            onGround: false,
            yaw: v?.yaw ?? 0,
            velocity: { x: f.x * speed, y: 0, z: f.z * speed },
            testInput: right,
          }),
        ];
        uc.execute(i);
      }
    };
    fly(60);
    const angle = world.properties.get("a")?.bank;
    expect(angle).toBe(SUV_SPEC.maxBank);
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
    expect(world.shone.get("on")).toEqual(
      headlightCells(location, 30, SUV_PROFILE.beams),
    );
    expect(world.shone.get("off")).toEqual([]);
  });

  it("clears the lights of a vehicle that is no longer loaded", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    repo.save(createVehicle("suv", "gone", 0));
    world.shone.set("gone", [{ x: 0, y: 0, z: 4 }]);
    new DriveVehicles(world, repo, logger()).execute(0);
    expect(world.shone.get("gone")).toEqual([]);
  });

  it("logs a failed light clear of an unloaded vehicle and still clears and forgets the others", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    const log = logger();
    repo.save(createVehicle("suv", "stuck", 0));
    repo.save(createVehicle("suv", "gone", 0));
    world.shone.set("gone", [{ x: 0, y: 0, z: 4 }]);
    world.failShineOn = "stuck";
    new DriveVehicles(world, repo, log).execute(0);
    expect(log.lines).toEqual(["stuck: Error: lights"]);
    expect(world.shone.get("gone")).toEqual([]);
    expect(repo.ids()).toEqual([]);
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
    const flying = {
      restored: () => ({ form: "hover" }) as const,
      onGround: false,
    };
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
    expect(world.formOf("a")).toBe("takeoff");
    // Takeoff and landing count as off the ground (ADR 0028).
    expect(cameraCalls(world)).toEqual(["camera:p:third"]);
    while (world.formOf("a") !== "hover") drive(idle, false);
    for (const input of tapTwice) drive(input, false);
    expect(world.formOf("a")).toBe("landing");
    expect(cameraCalls(world)).toEqual(["camera:p:third"]);
    drive(idle, true);
    expect(world.formOf("a")).toBe("car");
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
        restored: () => ({ form: "hover" }),
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
        restored: () => ({ form: "hover" }),
        onGround: false,
        riders: [rider("p")],
      }),
    ];
    for (let tick = 0; tick < 5; tick++) uc.execute(tick);
    expect(log.lines.filter((l) => l.includes("camera p"))).toHaveLength(1);
  });

  it("logs a camera failure again when it fails after a switch that worked", () => {
    const world = new FakeWorld();
    const log = logger();
    const uc = new DriveVehicles(world, new InMemoryRepo(), log);
    const flying = {
      restored: () => ({ form: "hover" }) as const,
      onGround: false,
    };
    const riding = [snapshot("a", { ...flying, riders: [rider("p")] })];
    world.snapshots = riding;
    world.failCameraOn = "p";
    uc.execute(0);
    world.failCameraOn = undefined;
    uc.execute(1);
    world.snapshots = [snapshot("a", flying)];
    uc.execute(2);
    world.snapshots = riding;
    world.failCameraOn = "p";
    uc.execute(3);
    expect(cameraCalls(world)).toEqual(["camera:p:third", "camera:p:own"]);
    expect(log.lines.filter((l) => l.includes("camera p"))).toHaveLength(2);
  });

  it("retries giving the view back when it fails", () => {
    const world = new FakeWorld();
    const uc = new DriveVehicles(world, new InMemoryRepo(), logger());
    world.snapshots = [
      snapshot("a", {
        restored: () => ({ form: "hover" }),
        onGround: false,
        riders: [rider("p")],
      }),
    ];
    uc.execute(0);
    world.snapshots = [
      snapshot("a", { restored: () => ({ form: "hover" }), onGround: false }),
    ];
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
        waterDepth: SUV_SPEC.carHeight,
        riders: [rider("driver"), rider("passenger")],
      }),
    ];
    uc.execute(0);
    expect(world.formOf("a")).toBe("submarine");
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
        restored: () => ({ form: "hover" }),
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
        waterDepth: SUV_SPEC.carHeight,
        riders: [rider("bad"), rider("good")],
      }),
      snapshot("b", {
        waterDepth: SUV_SPEC.carHeight,
        riders: [rider("other")],
      }),
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
        restored: () => ({ form: "submarine" }),
        waterDepth: SUV_SPEC.carHeight,
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
      snapshot("a", { waterDepth: SUV_SPEC.carHeight, riders: [rider("p")] }),
    ];
    uc.execute(0);
    world.snapshots = [snapshot("a", { waterDepth: SUV_SPEC.carHeight })];
    uc.execute(20);
    expect(breathingCalls(world)).toEqual([breathing("p")]);
    expect(world.calls).toContain("camera:p:own");
  });
});

it("drives a boat with water below high feet and leaves a dry boat still", () => {
  fc.assert(
    fc.property(fc.boolean(), (waterBelow) => {
      const world = new FakeWorld();
      const repo = new InMemoryRepo();
      const log = logger();
      world.snapshots = [
        snapshot("boat", {
          kind: "sportsboat",
          waterDepth: 0,
          waterBelow,
          onGround: false,
          testInput: FULL_THROTTLE,
        }),
      ];
      new DriveVehicles(world, repo, log).execute(0);
      const speed = repo.get("boat")?.speed;
      if (waterBelow) expect(speed).toBeGreaterThan(0);
      else expect(speed).toBe(0);
      expect(log.lines).toEqual([]);
    }),
  );
});

it("reads restored properties only when an aggregate is missing", () => {
  const world = new FakeWorld();
  const restored = vi.fn(() => ({ form: "hover" }));
  world.snapshots = [
    snapshot("a", {
      restored,
      onGround: false,
      testInput: { moveX: 0, moveY: 0, jump: false },
    }),
  ];
  const uc = new DriveVehicles(world, new InMemoryRepo(), { warn: vi.fn() });
  uc.execute(0);
  uc.execute(1);
  expect(restored).toHaveBeenCalledTimes(1);
});

it("passes deck input through and boards before keeping deck seats", () => {
  const world = new FakeWorld();
  world.snapshots = [
    snapshot("boat", {
      kind: "sportsboat",
      restored: () => ({ docked: true }),
      deckSeatInputs: [FULL_THROTTLE],
    }),
  ];
  const board = vi.spyOn(world, "boardDeckRiders");
  const keep = vi.spyOn(world, "keepDeckSeats");
  const log = logger();
  new DriveVehicles(world, new InMemoryRepo(), log).execute(0);
  expect(board).toHaveBeenCalledWith("boat");
  expect(keep).toHaveBeenCalledWith(
    "boat",
    expect.arrayContaining([
      expect.objectContaining({ y: world.snapshots[0]?.location.y }),
    ]),
    0,
  );
  expect(board.mock.invocationCallOrder[0]).toBeLessThan(
    defined(keep.mock.invocationCallOrder[0], "keep order"),
  );
  expect(log.lines).toEqual([]);
});

it("clears deck seats without boarding for ordinary motion", () => {
  const world = new FakeWorld();
  world.snapshots = [snapshot("a")];
  const board = vi.spyOn(world, "boardDeckRiders");
  const keep = vi.spyOn(world, "keepDeckSeats");
  new DriveVehicles(world, new InMemoryRepo(), logger()).execute(0);
  expect(board).not.toHaveBeenCalled();
  expect(keep).toHaveBeenCalledWith("a", [], 0);
});
