import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dot,
  forward,
  length,
  type Vec3,
} from "../../../src/domain/shared/vec";
import type {
  DriveInput,
  RawInput,
} from "../../../src/domain/vehicle/driveInput";
import { type Form, verticalImpulse } from "../../../src/domain/vehicle/form";
import {
  AIR,
  initialMotion,
  stepFlightMotion,
  WATER,
} from "../../../src/domain/vehicle/motion";
import type { RamTarget } from "../../../src/domain/vehicle/ram";
import {
  createVehicle,
  rebuildVehicle,
} from "../../../src/domain/vehicle/registry";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { SUV_MOTION } from "../../../src/domain/vehicle/suvDrive";
import type { TickOutcome } from "../../../src/domain/vehicle/vehicle";
import { propertyValue } from "../../support/engineCommands";
import {
  type Body,
  engineStep,
  GRAVITY,
  VERTICAL_DRAG,
  WATER_DRAG,
  WATER_VERTICAL_DRAG,
} from "../../support/engineModel";
import { waterSensors } from "../../support/waterDepth";

const IDLE: RawInput = { moveX: 0, moveY: 0, jump: false };
const FORWARD: RawInput = { ...IDLE, moveY: 1 };
const FULL_THROTTLE: DriveInput = {
  throttle: 1,
  steer: 0,
  handbrake: false,
  creep: false,
};
const depth = fc.double({ min: SPEC.carHeight, max: 10, noNaN: true });
const shallowDepth = fc
  .double({ min: 0, max: SPEC.carHeight, noNaN: true })
  .filter((d) => d < SPEC.carHeight);
const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const rawInput = fc.record({
  moveX: fc.double({ min: -1, max: 1, noNaN: true }),
  moveY: fc.double({ min: -1, max: 1, noNaN: true }),
  jump: fc.boolean(),
});

function stepAhead(height: number): (offset: Vec3) => boolean {
  return (offset) =>
    offset.z >= SPEC.hitboxFront && offset.y >= 0 && offset.y < height;
}

class DiveSim {
  form: Form;
  gravity: boolean;
  bankAngle = 0;
  wheelsDown = true;
  tick = 0;
  y = 0;
  vy = 0;
  body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  readonly changes: Form[] = [];
  obstacle: (offset: Vec3) => boolean = () => false;
  targets: () => readonly RamTarget[] = () => [];

  constructor(
    readonly surface: number,
    readonly vehicle = createVehicle("suv", "vehicle", 0),
    form: Form = "car",
  ) {
    this.form = form;
    this.gravity = form === "car";
  }

  get waterDepth(): number {
    return Math.max(0, this.surface - this.y);
  }

  step(input: RawInput | undefined): TickOutcome {
    const out = this.vehicle.tick({
      tick: this.tick++,
      riders: [],
      testInput: input,
      velocity: { ...this.body.vel, y: this.vy },
      onGround: this.y <= 0,
      ...waterSensors(this.waterDepth),
      solidAt: (offset) => this.y + offset.y < 0 || this.obstacle(offset),
      targets: this.targets,
    });
    const form = propertyValue(out.commands, "form") as Form | undefined;
    if (form) {
      this.changes.push(form);
      this.form = form;
    }
    const gear = propertyValue(out.commands, "gear_down");
    if (typeof gear === "boolean") this.wheelsDown = gear;
    const bank = propertyValue(out.commands, "bank");
    if (typeof bank === "number") this.bankAngle = bank;
    for (const command of out.commands)
      if (command.type === "triggerEvent")
        this.gravity = command.name === "gravity_on";
    const underwater = this.form === "submarine";
    this.body = engineStep(
      this.body,
      { x: out.impulse.x, z: out.impulse.z },
      { mu: SPEC.defaultFriction, drag: underwater ? WATER_DRAG : undefined },
      this.y <= 0,
    ).body;
    const gravity = this.gravity ? GRAVITY : 0;
    let vy = this.vy + out.impulse.y - gravity;
    this.y += vy;
    if (this.y <= 0) {
      this.y = 0;
      vy = 0;
    }
    this.vy = vy * (underwater ? WATER_VERTICAL_DRAG : VERTICAL_DRAG);
    return out;
  }

  run(input: RawInput | undefined, ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step(input);
  }
}

describe("Vehicle as a submarine", () => {
  it("enters submarine once and holds depth on a submerged floor without ping-pong", () => {
    fc.assert(
      fc.property(depth, yaw, (d, heading) => {
        const sim = new DiveSim(d, createVehicle("suv", "vehicle", heading));
        sim.run(IDLE, 300);
        expect(sim.changes).toEqual(["submarine"]);
        expect(sim.form).toBe("submarine");
        expect(sim.y).toBe(0);
      }),
    );
  });

  it("keeps a car in water shallower than its roof", () => {
    fc.assert(
      fc.property(shallowDepth, (d) => {
        const sim = new DiveSim(d);
        sim.run(IDLE, 100);
        expect(sim.changes).toEqual([]);
        expect(sim.form).toBe("car");
      }),
    );
  });

  it("levels off at water speed and coasts without reversing when the stick is pulled back", () => {
    fc.assert(
      fc.property(yaw, (heading) => {
        const sim = new DiveSim(100, createVehicle("suv", "vehicle", heading));
        sim.y = 50;
        sim.run(FORWARD, 100);
        expect(length(sim.body.vel)).toBeCloseTo(SPEC.maxWaterSpeed, 6);
        for (let i = 0; i < 100; i++) {
          sim.step({ ...IDLE, moveY: -1 });
          expect(
            dot(sim.body.vel, forward(sim.vehicle.yaw)),
          ).toBeGreaterThanOrEqual(-1e-9);
          expect(length(sim.body.vel)).toBeLessThanOrEqual(
            SPEC.maxWaterSpeed + 1e-9,
          );
        }
        expect(length(sim.body.vel)).toBeCloseTo(0, 6);
      }),
    );
  });

  it("holds depth with idle input, rises with Jump, and sinks with the stick", () => {
    fc.assert(
      fc.property(depth, (d) => {
        const sim = new DiveSim(
          100,
          rebuildVehicle("suv", "vehicle", 0, [], { form: "submarine" }),
          "submarine",
        );
        sim.y = 100 - d;
        sim.vy = -0.1;
        sim.run(IDLE, 50);
        expect(sim.waterDepth).toBeCloseTo(d, 6);
        sim.step({ ...IDLE, jump: true });
        expect(sim.vy).toBeCloseTo(SPEC.maxClimb, 6);
        sim.step({ ...IDLE, moveY: -1 });
        expect(sim.vy).toBeCloseTo(-SPEC.maxClimb, 6);
      }),
    );
  });

  it("rises without a driver and settles at the float line without becoming hover or car", () => {
    fc.assert(
      fc.property(depth, (d) => {
        const sim = new DiveSim(d);
        const first = sim.step(undefined);
        expect(first.impulse.y).toBeGreaterThan(0);
        sim.run(undefined, 400);
        expect(sim.waterDepth).toBeCloseTo(SPEC.floatDraft, 6);
        expect(sim.vy).toBeCloseTo(0, 6);
        expect(sim.changes).toEqual(["submarine"]);
        expect(sim.y).toBeGreaterThan(0);
      }),
    );
  });

  it("rises for a clear one- or two-block step only while throttling forward", () => {
    fc.assert(
      fc.property(fc.constantFrom(1, 2), fc.boolean(), (height, ground) => {
        const sim = new DiveSim(100);
        sim.y = ground ? 0 : 50;
        sim.obstacle = stepAhead(height);
        sim.step(IDLE);
        expect(sim.vy).toBe(0);
        const rising = sim.step(FORWARD);
        expect(sim.vy).toBeCloseTo(SPEC.maxClimb, 6);
        expect(rising.impulse.y).toBeGreaterThan(0);
        sim.obstacle = () => false;
        sim.vy = 0;
        sim.step(FORWARD);
        expect(sim.vy).toBe(0);
        sim.obstacle = stepAhead(height);
        sim.y = 50;
        sim.step({ ...IDLE, moveY: -1 });
        expect(sim.vy).toBeCloseTo(-SPEC.maxClimb, 6);
      }),
    );
  });

  it("rises for a step that stands less than half a block above its floating feet", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 0.49, noNaN: true }),
        (stepTop) => {
          const sim = new DiveSim(100);
          sim.y = 50;
          sim.obstacle = (offset) =>
            offset.z >= SPEC.hitboxFront && offset.y < stepTop;
          sim.step(IDLE);
          sim.step(FORWARD);
          expect(sim.vy).toBeCloseTo(SPEC.maxClimb, 6);
        },
      ),
    );
  });

  it("never rises at full throttle over a flat floor at or less than half a block below its feet", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 0.49, noNaN: true }),
        yaw,
        (gap, heading) => {
          const sim = new DiveSim(
            100,
            rebuildVehicle("suv", "vehicle", heading, [], {
              form: "submarine",
            }),
            "submarine",
          );
          sim.y = gap;
          for (let i = 0; i < 60; i++) {
            sim.step(FORWARD);
            expect(sim.vy).toBeCloseTo(0, 12);
            expect(sim.y).toBeCloseTo(gap, 12);
          }
        },
      ),
    );
  });

  it("climbs a shore step fixed in the world from any fractional float height", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.05, max: 0.95, noNaN: true }), (below) => {
        const stepTop = 51;
        const sim = new DiveSim(100);
        sim.y = stepTop - below;
        sim.obstacle = (offset) =>
          offset.z >= SPEC.hitboxFront && sim.y + offset.y < stepTop;
        sim.run(FORWARD, 40);
        expect(sim.y).toBeGreaterThanOrEqual(stepTop);
      }),
    );
  });

  it("looks ahead at least stepMinSpeed's distance when rising from a near stop", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.4, max: 0.85, noNaN: true }), (face) => {
        const sim = new DiveSim(100);
        sim.y = 50;
        sim.obstacle = (offset) =>
          offset.z >= SPEC.hitboxFront + face && offset.y >= 0 && offset.y < 1;
        sim.step(IDLE);
        sim.step(FORWARD);
        expect(sim.vehicle.speed).toBeLessThan(SPEC.stepMinSpeed);
        expect(sim.vy).toBeCloseTo(SPEC.maxClimb, 6);
      }),
    );
  });

  it("does not rise for a step while still rolling backward from reverse", () => {
    const land = new DiveSim(0);
    land.run({ ...IDLE, moveY: -1 }, 30);
    expect(land.vehicle.speed).toBeLessThan(0);
    const sim = new DiveSim(100, land.vehicle);
    sim.body = land.body;
    sim.obstacle = stepAhead(1);
    let reversingTicks = 0;
    for (let i = 0; i < 100 && sim.vy === 0; i++) {
      sim.step(FORWARD);
      if (sim.vehicle.speed < 0) {
        reversingTicks++;
        expect(sim.vy).toBe(0);
      }
    }
    expect(reversingTicks).toBeGreaterThan(0);
    expect(sim.vehicle.speed).toBeGreaterThanOrEqual(0);
    expect(sim.vy).toBeCloseTo(SPEC.maxClimb, 6);
  });

  it("caps speed at water speed so a released throttle slows down at once", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
          minLength: 1,
          maxLength: 150,
        }),
        (throttles) => {
          const sim = new DiveSim(1000);
          sim.y = 500;
          for (const moveY of throttles) {
            sim.step({ ...IDLE, moveY });
            expect(sim.vehicle.speed).toBeLessThanOrEqual(SPEC.maxWaterSpeed);
          }
          sim.run(FORWARD, 100);
          expect(sim.vehicle.speed).toBe(SPEC.maxWaterSpeed);
          let previous = length(sim.body.vel);
          for (let i = 0; i < 5; i++) {
            sim.step(IDLE);
            const now = length(sim.body.vel);
            expect(now).toBeLessThan(previous);
            previous = now;
          }
        },
      ),
    );
  });

  it("still rises while a shore step stops it, as a step jump does on the ground", () => {
    const sim = new DiveSim(100);
    sim.obstacle = stepAhead(1);
    sim.run(FORWARD, 30);
    sim.y = 0;
    sim.vy = 0;
    sim.body.vel = { x: 0, z: 0 };
    sim.step(FORWARD);
    expect(sim.vehicle.speed).toBeLessThan(SPEC.stepMinSpeed);
    expect(sim.vy).toBeCloseTo(SPEC.maxClimb, 6);
  });

  // The submarine rolls into turns like the hover form (ADR 0044), within the
  // same limit.
  it("keeps its bank within maxBank, gear down, and horizontal speed bounded throughout random dive controls", () => {
    fc.assert(
      fc.property(
        fc.array(rawInput, { minLength: 1, maxLength: 200 }),
        (inputs) => {
          const sim = new DiveSim(1000);
          sim.y = 500;
          let sent: number | undefined;
          for (const input of inputs) {
            const out = sim.step(input);
            expect(Math.abs(sim.bankAngle)).toBeLessThanOrEqual(
              SPEC.maxBank + 1e-9,
            );
            expect(sim.wheelsDown).toBe(true);
            // The client sees every new angle: it is sent on the tick it
            // changes, and on the first tick (ADR 0026).
            if (sim.bankAngle !== sent)
              expect(propertyValue(out.commands, "bank")).toBe(sim.bankAngle);
            sent = sim.bankAngle;
            expect(
              propertyValue(out.commands, "gear_down") === undefined ||
                propertyValue(out.commands, "gear_down"),
            ).toBe(true);
            expect(length(sim.body.vel)).toBeLessThanOrEqual(
              SPEC.maxWaterSpeed + 1e-9,
            );
            expect(Math.abs(sim.vy)).toBeLessThanOrEqual(SPEC.maxClimb + 1e-9);
          }
        },
      ),
    );
  });

  // Unlike hover, a banked submarine does not sink: buoyancy and the climb
  // input set its vertical speed (ADR 0044).
  it("banks into a turn under water, keeps its depth, and levels out after", () => {
    const sim = new DiveSim(1000);
    sim.y = 500;
    sim.run(FORWARD, 40);
    expect(sim.form).toBe("submarine");
    const depth = sim.y;
    sim.run({ ...FORWARD, moveX: 1 }, 20);
    expect(sim.bankAngle).toBeLessThan(-SPEC.maxBank / 2);
    expect(Math.abs(sim.y - depth)).toBeLessThan(0.05);
    sim.run(FORWARD, 20);
    expect(sim.bankAngle).toBe(0);
  });

  it("breaches into hover with Jump held and becomes a car on a shallow shore", () => {
    const sim = new DiveSim(5);
    sim.run({ ...IDLE, jump: true }, 30);
    expect(sim.changes).toEqual(["submarine", "hover"]);
    expect(sim.form).toBe("hover");

    fc.assert(
      fc.property(shallowDepth, (d) => {
        const beached = new DiveSim(
          d,
          rebuildVehicle("suv", "vehicle", 0, [], { form: "submarine" }),
          "submarine",
        );
        beached.step(IDLE);
        expect(beached.changes).toEqual(["car"]);
      }),
    );
  });

  it("keeps ram damage enabled and lowers speed when a wall stops it", () => {
    const sim = new DiveSim(100);
    sim.run(FORWARD, 60);
    sim.targets = () => [
      { id: "mob", offset: { x: 0, y: 0, z: 1.5 }, protectedOccupant: false },
    ];
    expect(sim.step(FORWARD).hits).toHaveLength(1);
    sim.body.vel = { x: 0, z: 0 };
    const stopped = sim.step(FORWARD);
    expect(stopped.hits).toEqual([]);
    expect(sim.vehicle.speed).toBe(0);
  });
});

describe("Motion medium contract", () => {
  it("exposes air and water tuning", () => {
    expect(AIR).toEqual({ drag: SPEC.flightDrag, maxSpeed: SPEC.maxSpeed });
    expect(WATER).toEqual({
      drag: SPEC.waterDrag,
      maxSpeed: SPEC.maxWaterSpeed,
    });
  });

  it("uses water drag for the per-axis wall threshold", () => {
    fc.assert(
      fc.property(fc.boolean(), (onX) => {
        const expected = onX ? { x: 1, z: 0 } : { x: 0, z: 1 };
        // Between the air and water wall thresholds, only air reports a wall.
        const kept = ((AIR.drag + WATER.drag) / 2) * SPEC.blockedRatio;
        const velocity = { x: expected.x * kept, z: expected.z * kept };
        const state = {
          ...initialMotion(onX ? -90 : 0),
          speed: SPEC.maxWaterSpeed,
          airExpected: expected,
        };
        expect(
          stepFlightMotion(state, FULL_THROTTLE, velocity, WATER, SUV_MOTION)
            .blocked,
        ).toBe(false);
        expect(
          stepFlightMotion(state, FULL_THROTTLE, velocity, AIR, SUV_MOTION)
            .blocked,
        ).toBe(true);
        expect(
          stepFlightMotion(
            state,
            FULL_THROTTLE,
            { x: 0, z: 0 },
            WATER,
            SUV_MOTION,
          ).blocked,
        ).toBe(true);
      }),
    );
  });

  it("pre-divides vertical impulses by the supplied drag and keeps the air default", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -SPEC.maxClimb, max: SPEC.maxClimb, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        (target, observed) => {
          expect(
            (observed +
              verticalImpulse(target, observed, WATER_VERTICAL_DRAG)) *
              WATER_VERTICAL_DRAG,
          ).toBeCloseTo(target, 12);
          expect(verticalImpulse(target, observed)).toBe(
            verticalImpulse(target, observed, SPEC.flightVerticalDrag),
          );
        },
      ),
    );
  });
});
