import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dot,
  forward,
  rightOf,
  type Vec2,
  type Vec3,
} from "../../../src/domain/shared/vec";
import type { RawInput } from "../../../src/domain/vehicle/driveInput";
import {
  createVehicle,
  rebuildVehicle,
} from "../../../src/domain/vehicle/kinds/index";
import { SuvDrive } from "../../../src/domain/vehicle/kinds/suv/drive";
import type { Form } from "../../../src/domain/vehicle/kinds/suv/form";
import { SUV_SPEC } from "../../../src/domain/vehicle/kinds/suv/spec";
import { SPEC } from "../../../src/domain/vehicle/spec";
import type { Vehicle } from "../../../src/domain/vehicle/vehicle";
import { propertyValue } from "../../support/engineCommands";
import { AIR_DRAG, GRAVITY, VERTICAL_DRAG } from "../../support/engineModel";
import { waterSensors } from "../../support/waterDepth";

const GROUND_FRICTION = 0.688;
const IDLE: RawInput = { moveX: 0, moveY: 0, jump: false };
const FORWARD: RawInput = { moveX: 0, moveY: 1, jump: false };

/**
 * One vehicle driven by test input over flat ground at y = 0. Gravity follows
 * the form the vehicle reports, as the yasu_ride:weightless component group
 * does in game.
 */
class FlightSim {
  tick = 0;
  y = 0;
  vy = 0;
  vel: Vec2 = { x: 0, z: 0 };
  gravity: boolean;
  form: Form;
  wheelsDown = true;
  bankAngle = 0;
  readonly changes: Form[] = [];
  /** Each landing gear change with the height it happened at. */
  readonly gearYs: [boolean, number][] = [];

  constructor(
    readonly vehicle: Vehicle = createVehicle("suv", "car", 0),
    form: Form = "car",
  ) {
    this.form = form;
    this.gravity = form === "car";
    this.wheelsDown = form === "car";
  }

  get onGround(): boolean {
    return this.y <= 0;
  }

  private horizontalDrag(): number {
    if (!this.gravity) return SUV_SPEC.flightDrag;
    return this.onGround ? GROUND_FRICTION : AIR_DRAG;
  }

  step(input: RawInput | undefined): void {
    const out = this.vehicle.tick({
      tick: this.tick++,
      riders: [],
      testInput: input,
      velocity: { ...this.vel, y: this.vy },
      onGround: this.onGround,
      ...waterSensors(),
      // The ground is solid below y = 0.
      solidAt: (offset) => this.y + offset.y < 0,
      targets: () => [],
    });
    const gearDown = propertyValue(out.commands, "gear_down");
    if (typeof gearDown === "boolean") {
      this.gearYs.push([gearDown, this.y]);
      this.wheelsDown = gearDown;
    }
    const bank = propertyValue(out.commands, "bank");
    if (typeof bank === "number") this.bankAngle = bank;
    const form = propertyValue(out.commands, "form") as Form | undefined;
    if (form) {
      this.changes.push(form);
      this.form = form;
    }
    for (const command of out.commands)
      if (command.type === "triggerEvent")
        this.gravity = command.name === "gravity_on";
    const drag = this.horizontalDrag();
    this.vel = {
      x: (this.vel.x + out.impulse.x) * drag,
      z: (this.vel.z + out.impulse.z) * drag,
    };
    let vy = this.vy + out.impulse.y - (this.gravity ? GRAVITY : 0);
    this.y += vy;
    if (this.y <= 0) {
      this.y = 0;
      vy = 0;
    }
    this.vy = vy * VERTICAL_DRAG;
  }

  run(input: RawInput | undefined, ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step(input);
  }

  /** Two Jump presses two ticks apart. */
  doubleTap(base: RawInput = IDLE): void {
    const pressed = { ...base, jump: true };
    this.step(pressed);
    this.step(base);
    this.step(pressed);
    this.step(base);
  }
}

function flyingSim(): FlightSim {
  const sim = new FlightSim();
  sim.doubleTap();
  sim.run(IDLE, SUV_SPEC.takeoffTicks);
  expect(sim.form).toBe("hover");
  return sim;
}

describe("Vehicle in flight (ADR 0021)", () => {
  it("ignores the controls during takeoff", () => {
    fc.assert(
      fc.property(
        fc.record({
          moveX: fc.double({ min: -1, max: 1, noNaN: true }),
          moveY: fc.double({ min: -1, max: 1, noNaN: true }),
          jump: fc.boolean(),
        }),
        (input) => {
          const held = new FlightSim();
          const idle = new FlightSim();
          for (const sim of [held, idle]) {
            sim.run(FORWARD, 20);
            sim.doubleTap(FORWARD);
          }
          expect(held.form).toBe("takeoff");
          expect(held.vehicle.speed).toBeGreaterThan(0);
          let ticks = 0;
          for (; ticks <= SUV_SPEC.takeoffTicks; ticks++) {
            held.step(input);
            idle.step(IDLE);
            if (held.form !== "takeoff") break;
            expect(held.vehicle.speed).toBe(idle.vehicle.speed);
            expect(held.vehicle.yaw).toBe(idle.vehicle.yaw);
          }
          expect(ticks).toBeGreaterThan(0);
          expect(held.form).toBe("hover");
        },
      ),
    );
  });

  it("does not count driverless ticks as a Jump press", () => {
    fc.assert(
      fc.property(
        // The press comes within doubleTapTicks of every driverless tick, so
        // a driverless tick read as a Jump press would always pair with it.
        fc
          .integer({ min: 1, max: SUV_SPEC.doubleTapTicks - 1 })
          .chain((driverless) =>
            fc.tuple(
              fc.constant(driverless),
              fc.integer({ min: 1, max: SUV_SPEC.doubleTapTicks - driverless }),
            ),
          ),
        ([driverless, idle]) => {
          const sim = new FlightSim();
          sim.run(undefined, driverless);
          sim.run(IDLE, idle);
          sim.step({ ...IDLE, jump: true });
          sim.run(IDLE, SUV_SPEC.takeoffTicks);
          expect(sim.changes).toEqual([]);
          expect(sim.form).toBe("car");
        },
      ),
    );
  });

  it("takes off on a double tap and rises about 1.5 blocks before flying", () => {
    const sim = new FlightSim();
    sim.doubleTap();
    sim.run(IDLE, SUV_SPEC.takeoffTicks + 5);
    expect(sim.changes).toEqual(["takeoff", "hover"]);
    expect(sim.y).toBeGreaterThan(1.2);
    expect(sim.y).toBeLessThan(1.8);
  });

  it("never leaves the ground while Jump is held down as one long press", () => {
    const sim = new FlightSim();
    sim.run({ ...FORWARD, jump: true }, 200);
    expect(sim.changes).toEqual([]);
    expect(sim.y).toBe(0);
  });

  it("ignores Jump presses during takeoff", () => {
    const sim = new FlightSim();
    sim.doubleTap();
    sim.doubleTap();
    sim.run(IDLE, SUV_SPEC.takeoffTicks);
    expect(sim.changes).toEqual(["takeoff", "hover"]);
  });

  it("holds altitude while cruising with a level view and reaches max speed", () => {
    const sim = flyingSim();
    const y0 = sim.y;
    sim.run(FORWARD, 100);
    expect(Math.abs(sim.y - y0)).toBeLessThan(1e-6);
    expect(Math.hypot(sim.vel.x, sim.vel.z)).toBeGreaterThan(
      SUV_SPEC.maxSpeed * 0.95,
    );
  });

  it("climbs while Jump is held and sinks while the stick is pulled back (ADR 0032)", () => {
    const sim = flyingSim();
    sim.run(FORWARD, 50);
    const y0 = sim.y;
    sim.run({ ...FORWARD, jump: true }, 20);
    expect(sim.y).toBeGreaterThan(y0 + 5);
    const y1 = sim.y;
    const v1 = sim.vehicle.speed;
    sim.run({ moveX: 0, moveY: -1, jump: false }, 10);
    expect(sim.y).toBeLessThan(y1 - 2);
    // The car coasts under drag alone; read as a brake, the pulled-back stick
    // would shed 10 * SUV_SPEC.brake instead.
    expect(v1 - sim.vehicle.speed).toBeCloseTo(10 * SUV_SPEC.drag, 6);
  });

  it("climbs on held Jump while hovering in place (ADR 0032)", () => {
    const sim = flyingSim();
    const y0 = sim.y;
    sim.run({ ...IDLE, jump: true }, 20);
    expect(sim.y).toBeGreaterThan(y0 + 5);
    expect(sim.form).toBe("hover");
  });

  it("lands on a second double tap and turns gravity back on when it touches down", () => {
    const sim = flyingSim();
    sim.doubleTap();
    expect(sim.changes.at(-1)).toBe("landing");
    sim.run(IDLE, 40);
    expect(sim.changes.slice(-2)).toEqual(["landing", "car"]);
    expect(sim.y).toBe(0);
    expect(sim.gravity).toBe(true);
  });

  it("lowers the wheels before touchdown when landing from high up (ADR 0033)", () => {
    const sim = flyingSim();
    sim.run({ ...IDLE, jump: true }, 30);
    sim.run(IDLE, 10);
    expect(sim.wheelsDown).toBe(false);
    sim.doubleTap();
    sim.run(IDLE, 100);
    expect(sim.form).toBe("car");
    expect(sim.gearYs.map(([down]) => down)).toEqual([true, false, true]);
    const [, y] = sim.gearYs.at(-1) ?? [true, 0];
    expect(y).toBeGreaterThan(SUV_SPEC.gearDownHeight - 1);
    expect(y).toBeLessThanOrEqual(SUV_SPEC.gearDownHeight);
  });

  it("returns to the ground when it sinks onto it in flight (ADR 0034)", () => {
    const sim = flyingSim();
    sim.run({ moveX: 0, moveY: -1, jump: false }, 20);
    expect(sim.changes.slice(-1)).toEqual(["car"]);
    expect(sim.changes).not.toContain("landing");
    expect(sim.gravity).toBe(true);
    expect(sim.y).toBe(0);
    expect(sim.wheelsDown).toBe(true);
    expect(sim.gearYs.at(-1)?.[0]).toBe(true);
  });

  it("starts landing as soon as the input goes away mid-flight", () => {
    const sim = flyingSim();
    sim.step(undefined);
    expect(sim.changes.at(-1)).toBe("landing");
    sim.run(undefined, 40);
    expect(sim.form).toBe("car");
  });

  it("keeps flying without reporting a change when rebuilt in flight", () => {
    const sim = new FlightSim(
      rebuildVehicle("suv", "car", 0, [], { form: "hover" }),
      "hover",
    );
    sim.y = 5;
    sim.run(FORWARD, 20);
    expect(sim.changes).toEqual([]);
    expect(sim.y).toBeCloseTo(5, 6);
  });

  it("rams a target at most once when it flies into a wall with the throttle held", () => {
    const sim = flyingSim();
    sim.run(FORWARD, 60);
    const f = forward(sim.vehicle.yaw);
    let hits = 0;
    for (let i = 0; i < 40; i++) {
      const out = sim.vehicle.tick({
        tick: sim.tick++,
        riders: [],
        testInput: FORWARD,
        velocity: { x: 0, y: 0, z: 0 },
        onGround: false,
        ...waterSensors(),
        solidAt: () => false,
        targets: () => [
          {
            id: "mob",
            offset: { x: f.x * 1.5, y: 0, z: f.z * 1.5 },
            protectedOccupant: false,
          },
        ],
      });
      hits += out.hits.length;
      if (i > 0) expect(out.hits).toEqual([]);
    }
    expect(hits).toBeLessThanOrEqual(1);
    expect(Math.abs(sim.vehicle.speed)).toBeLessThanOrEqual(SPEC.ramMinSpeed);
  });
});

describe("Vehicle banking (ADR 0026)", () => {
  function flying(): FlightSim {
    const sim = new FlightSim(
      rebuildVehicle("suv", "car", 0, [], { form: "hover" }),
      "hover",
    );
    sim.y = 10;
    return sim;
  }

  function bankOver(sim: FlightSim, input: RawInput, ticks: number): number[] {
    const banks: number[] = [];
    for (let i = 0; i < ticks; i++) {
      sim.step(input);
      banks.push(sim.bankAngle);
    }
    return banks;
  }

  it("banks left while steering left in flight and levels out after", () => {
    const sim = flying();
    bankOver(sim, FORWARD, 40);
    const left = bankOver(sim, { ...FORWARD, moveX: 1 }, 20);
    expect(left.at(-1)).toBeLessThan(0);
    const after = bankOver(sim, FORWARD, 20);
    expect(after.at(-1)).toBe(0);
  });

  it("loses altitude while banked and holds it in level flight", () => {
    const sim = flying();
    bankOver(sim, FORWARD, 40);
    const level = sim.y;
    bankOver(sim, FORWARD, 40);
    expect(Math.abs(sim.y - level)).toBeLessThan(0.05);
    bankOver(sim, { ...FORWARD, moveX: 1 }, 40);
    expect(sim.y).toBeLessThan(level - 0.5);
  });

  it("stays level while steering on the ground", () => {
    const sim = new FlightSim();
    bankOver(sim, FORWARD, 20);
    const turning = bankOver(sim, { ...FORWARD, moveX: 1 }, 20);
    expect(turning.every((b) => b === 0)).toBe(true);
  });
});

describe("Vehicle landing gear (ADR 0033)", () => {
  /** One airborne tick of a vehicle rebuilt mid-landing. */
  function landOnce(yaw: number, solidAt: (offset: Vec3) => boolean) {
    const drive = new SuvDrive(yaw, { form: "landing" });
    const out = drive.step(undefined, {
      tick: 0,
      velocity: { x: 0, y: 0, z: 0 },
      onGround: false,
      ...waterSensors(),
      solidAt,
      targets: () => [],
    });
    return {
      wheelsDown: drive.wheelsDown,
      gearDown: propertyValue(out.commands, "gear_down"),
    };
  }

  it("starts with the wheels down when placed", () => {
    expect(new SuvDrive(0, {}).wheelsDown).toBe(true);
  });

  it("keeps the wheels folded when rebuilt while landing high above the ground", () => {
    const { wheelsDown, gearDown } = landOnce(0, () => false);
    expect(gearDown).toBe(false);
    expect(wheelsDown).toBe(false);
  });

  it("lowers the wheels while landing over ground within gearDownHeight under the center or any corner, and keeps them up over deeper ground, in any heading", () => {
    const d = SUV_SPEC.gearProbeOffset;
    const spots = [
      [0, 0],
      [d, d],
      [d, -d],
      [-d, d],
      [-d, -d],
    ] as const;
    fc.assert(
      fc.property(
        fc.integer({ min: -180, max: 179 }),
        fc.constantFrom(...spots),
        fc.integer({ min: 1, max: SUV_SPEC.gearDownHeight + 1 }),
        (yaw, [ahead, side], depth) => {
          const f = forward(yaw);
          const r = rightOf(f);
          const { gearDown } = landOnce(
            yaw,
            // A one-block slab 0.4 blocks around one probe spot, `depth` blocks down.
            (o) =>
              Math.abs(dot(o, f) - ahead) <= 0.4 &&
              Math.abs(dot(o, r) - side) <= 0.4 &&
              o.y <= -depth &&
              o.y > -depth - 1,
          );
          expect(gearDown).toBe(depth <= SUV_SPEC.gearDownHeight);
        },
      ),
    );
  });
});
