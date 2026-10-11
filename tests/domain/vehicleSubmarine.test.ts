import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dot, forward, length, type Vec3 } from "../../src/domain/shared/vec";
import type { DriveInput, RawInput } from "../../src/domain/vehicle/driveInput";
import { type Form, verticalImpulse } from "../../src/domain/vehicle/form";
import {
  AIR,
  initialMotion,
  stepFlightMotion,
  WATER,
} from "../../src/domain/vehicle/motion";
import type { RamTarget } from "../../src/domain/vehicle/ram";
import { SPEC } from "../../src/domain/vehicle/spec";
import { type TickOutcome, Vehicle } from "../../src/domain/vehicle/vehicle";
import {
  type Body,
  engineStep,
  GRAVITY,
  VERTICAL_DRAG,
  WATER_DRAG,
  WATER_VERTICAL_DRAG,
} from "../support/engineModel";

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
  tick = 0;
  y = 0;
  vy = 0;
  body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  readonly changes: Form[] = [];
  obstacle: (offset: Vec3) => boolean = () => false;
  targets: () => readonly RamTarget[] = () => [];

  constructor(
    readonly surface: number,
    readonly vehicle = Vehicle.create("vehicle", 0),
  ) {}

  get waterDepth(): number {
    return Math.max(0, this.surface - this.y);
  }

  step(input: RawInput | undefined): TickOutcome {
    const out = this.vehicle.tick({
      tick: this.tick++,
      riders: [],
      testInput: input,
      velocity: this.body.vel,
      velocityY: this.vy,
      onGround: this.y <= 0,
      waterDepth: this.waterDepth,
      solidAt: (offset) => this.y + offset.y < 0 || this.obstacle(offset),
      targets: this.targets,
    });
    if (out.form) this.changes.push(out.form);
    const underwater = this.vehicle.form === "submarine";
    this.body = engineStep(
      this.body,
      { x: out.impulse.x, z: out.impulse.z },
      { mu: SPEC.defaultFriction, drag: underwater ? WATER_DRAG : undefined },
      this.y <= 0,
    ).body;
    const gravity = this.vehicle.form === "car" ? GRAVITY : 0;
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
        const sim = new DiveSim(d, Vehicle.create("vehicle", heading));
        sim.run(IDLE, 300);
        expect(sim.changes).toEqual(["submarine"]);
        expect(sim.vehicle.form).toBe("submarine");
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
        expect(sim.vehicle.form).toBe("car");
      }),
    );
  });

  it("levels off at water speed and coasts without reversing when the stick is pulled back", () => {
    fc.assert(
      fc.property(yaw, (heading) => {
        const sim = new DiveSim(100, Vehicle.create("vehicle", heading));
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
          Vehicle.rebuild("vehicle", 0, [], "submarine"),
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

  it("keeps its bank level, gear down, and horizontal speed bounded throughout random dive controls", () => {
    fc.assert(
      fc.property(
        fc.array(rawInput, { minLength: 1, maxLength: 200 }),
        (inputs) => {
          const sim = new DiveSim(1000);
          sim.y = 500;
          for (const input of inputs) {
            const out = sim.step(input);
            expect(sim.vehicle.bankAngle).toBe(0);
            expect(sim.vehicle.wheelsDown).toBe(true);
            expect(out.bank === undefined || out.bank === 0).toBe(true);
            expect(out.gearDown === undefined || out.gearDown).toBe(true);
            expect(length(sim.body.vel)).toBeLessThanOrEqual(
              SPEC.maxWaterSpeed + 1e-9,
            );
            expect(Math.abs(sim.vy)).toBeLessThanOrEqual(SPEC.maxClimb + 1e-9);
          }
        },
      ),
    );
  });

  it("breaches into hover with Jump held and becomes a car on a shallow shore", () => {
    const sim = new DiveSim(5);
    sim.run({ ...IDLE, jump: true }, 30);
    expect(sim.changes).toEqual(["submarine", "hover"]);
    expect(sim.vehicle.form).toBe("hover");

    fc.assert(
      fc.property(shallowDepth, (d) => {
        const beached = new DiveSim(
          d,
          Vehicle.rebuild("vehicle", 0, [], "submarine"),
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
  it("exposes air and water tuning and preserves air as the default", () => {
    expect(AIR).toEqual({ drag: SPEC.flightDrag, maxSpeed: SPEC.maxSpeed });
    expect(WATER).toEqual({
      drag: SPEC.waterDrag,
      maxSpeed: SPEC.maxWaterSpeed,
    });
    fc.assert(
      fc.property(yaw, (heading) => {
        const state = initialMotion(heading);
        const velocity = { x: 0, z: 0 };
        expect(stepFlightMotion(state, FULL_THROTTLE, velocity)).toEqual(
          stepFlightMotion(state, FULL_THROTTLE, velocity, AIR),
        );
      }),
    );
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
          stepFlightMotion(state, FULL_THROTTLE, velocity, WATER).blocked,
        ).toBe(false);
        expect(
          stepFlightMotion(state, FULL_THROTTLE, velocity, AIR).blocked,
        ).toBe(true);
        expect(
          stepFlightMotion(state, FULL_THROTTLE, { x: 0, z: 0 }, WATER).blocked,
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
