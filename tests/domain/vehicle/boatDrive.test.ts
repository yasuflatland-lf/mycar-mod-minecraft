import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  forward,
  leftOf,
  length,
  normalizeYaw,
  type Vec2,
  type Vec3,
} from "../../../src/domain/shared/vec";
import {
  BoatDrive,
  estimateWaterDrag,
  isAfloat,
  SPORTSBOAT_DRAG,
  SPORTSBOAT_WATER,
} from "../../../src/domain/vehicle/boatDrive";
import { driveFor } from "../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../src/domain/vehicle/driveInput";
import { FORMS } from "../../../src/domain/vehicle/form";
import type { VehicleKind } from "../../../src/domain/vehicle/kind";
import { initialMotion } from "../../../src/domain/vehicle/motion";
import {
  SPORTSBOAT_PROFILE,
  SUV_PROFILE,
} from "../../../src/domain/vehicle/profile";
import type { RamTarget } from "../../../src/domain/vehicle/ram";
import { SPEC } from "../../../src/domain/vehicle/spec";
import {
  type TickContext,
  type TickOutcome,
  Vehicle,
} from "../../../src/domain/vehicle/vehicle";
import { type Body, engineStep } from "../../support/engineModel";

const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const yaw = number(-180, 180);
const rawInput: fc.Arbitrary<RawInput> = fc.record({
  moveX: number(-1, 1),
  moveY: number(-1, 1),
  jump: fc.boolean(),
});
const FULL_THROTTLE: RawInput = { moveX: 0, moveY: 1, jump: false };
const steer = number(-1, 1);
/** A stick held sideways: beyond the deadzone and within SPEC.sidewaysAngle of horizontal (ADR 0018). */
const sideways: fc.Arbitrary<RawInput> = fc
  .tuple(number(0.2, 1), fc.constantFrom(-1, 1), number(-0.9, 0.9))
  .map(([x, sign, slope]) => ({
    moveX: sign * x,
    moveY: x * slope * Math.tan((SPEC.sidewaysAngle * Math.PI) / 180),
    jump: false,
  }));

/** Signed difference between two yaws, in (-180, 180]. */
const yawDelta = (from: number, to: number) => normalizeYaw(to - from);

interface Water {
  waterDepth?: number;
  waterBelow?: boolean;
}
const AFLOAT: Water = { waterDepth: 0.5 };
const BEACHED: Water = { waterDepth: 0, waterBelow: false };
/** The usual case for a floating hull: its feet sit above the water cell (ADR 0051). */
const WATER_BELOW: Water = { waterDepth: 0, waterBelow: true };
const waterDepth = number(0.01, 5);
const afloatWater: fc.Arbitrary<Water> = fc.oneof(
  waterDepth.map((d) => ({ waterDepth: d })),
  fc.constant(WATER_BELOW),
  waterDepth.map((d) => ({ waterDepth: d, waterBelow: true })),
);

/** Feeds a vehicle through the engine model: apply the impulse, then the medium's drag. */
class BoatSim {
  tick = 0;
  body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };

  constructor(
    readonly vehicle: Vehicle,
    private readonly drag: number,
  ) {}

  step(
    raw: RawInput | undefined,
    water: Water,
    targets: () => readonly RamTarget[] = () => [],
  ): TickOutcome {
    const out = this.vehicle.tick(
      context(this.tick++, raw, this.body.vel, water, targets),
    );
    this.body = engineStep(
      this.body,
      out.impulse,
      { mu: this.drag, drag: this.drag },
      true,
    ).body;
    return out;
  }
}

function context(
  tick: number,
  raw: RawInput | undefined,
  velocity: Vec2,
  water: Water,
  targets: () => readonly RamTarget[] = () => [],
): TickContext {
  return {
    tick,
    riders: [],
    testInput: raw,
    velocity,
    onGround: true,
    ...water,
    solidAt: () => false,
    targets,
  };
}

function boat(heading: number): Vehicle {
  return Vehicle.create("boat", heading, "sportsboat");
}

describe("isAfloat (ADR 0051)", () => {
  it("is afloat with water at the feet or 0.3 blocks below them, and beached otherwise", () => {
    fc.assert(
      fc.property(
        fc.option(number(-2, 10), { nil: undefined }),
        fc.option(fc.boolean(), { nil: undefined }),
        (depth, below) => {
          expect(isAfloat(depth, below)).toBe(
            (depth !== undefined && depth > 0) || below === true,
          );
        },
      ),
    );
  });
});

describe("estimateWaterDrag (ADR 0053)", () => {
  const estimate = number(SPORTSBOAT_DRAG.min, SPORTSBOAT_DRAG.max);
  const vector = fc.record({ x: number(-3, 3), z: number(-3, 3) });
  const given = fc.tuple(yaw, number(0.1, 3)).map(([heading, speed]) => {
    const f = forward(heading);
    return { x: f.x * speed, z: f.z * speed };
  });

  it("stays within the bounds for every sample and previous estimate", () => {
    fc.assert(
      fc.property(
        fc.option(number(-2, 2), { nil: undefined }),
        fc.option(vector, { nil: undefined }),
        vector,
        (prev, given, observed) => {
          const next = estimateWaterDrag(prev, given, observed);
          expect(next).toBeGreaterThanOrEqual(SPORTSBOAT_DRAG.min);
          expect(next).toBeLessThanOrEqual(SPORTSBOAT_DRAG.max);
        },
      ),
    );
  });

  it("converges to a constant true ratio at every heading", () => {
    fc.assert(
      fc.property(estimate, estimate, given, (prev, ratio, given) => {
        let drag = prev;
        const observed = { x: ratio * given.x, z: ratio * given.z };
        for (let t = 0; t < 60; t++)
          drag = estimateWaterDrag(drag, given, observed);
        expect(Math.abs(drag - ratio)).toBeLessThan(0.01);
      }),
    );
  });

  it("ignores a wall hit on either axis even when the other axis keeps its velocity", () => {
    fc.assert(
      fc.property(
        estimate,
        number(0.1, 3),
        number(0, 0.49),
        fc.boolean(),
        fc.boolean(),
        (prev, magnitude, kept, onX, reverse) => {
          const axis = reverse ? -magnitude : magnitude;
          const given = { x: axis, z: axis };
          const observed = onX
            ? { x: axis * prev * kept, z: axis * prev }
            : { x: axis * prev, z: axis * prev * kept };
          expect(estimateWaterDrag(prev, given, observed)).toBe(prev);
        },
      ),
    );
  });

  it("keeps the estimate without a previous given velocity or below the sampling threshold", () => {
    fc.assert(
      fc.property(
        estimate,
        yaw,
        number(0, SPORTSBOAT_DRAG.minGiven * 0.99),
        vector,
        (prev, heading, speed, observed) => {
          const f = forward(heading);
          expect(estimateWaterDrag(prev, undefined, observed)).toBe(prev);
          expect(
            estimateWaterDrag(
              prev,
              { x: f.x * speed, z: f.z * speed },
              observed,
            ),
          ).toBe(prev);
        },
      ),
    );
    expect(estimateWaterDrag(undefined, undefined, { x: 0, z: 0 })).toBe(
      SPORTSBOAT_DRAG.initial,
    );
  });

  it("clamps the sample before averaging rather than only clamping the result", () => {
    expect(estimateWaterDrag(0.83, { x: 1, z: 0 }, { x: 2, z: 0 })).toBeCloseTo(
      0.842,
      12,
    );
    expect(
      estimateWaterDrag(0.83, { x: 1, z: 0 }, { x: 0.5, z: 0 }),
    ).toBeCloseTo(0.817, 12);
  });
});

describe("BoatDrive (ADR 0051)", () => {
  it("carries the water estimate afloat and beached, and a higher estimate gives less velocity for the same target", () => {
    fc.assert(
      fc.property(yaw, number(SPORTSBOAT_DRAG.min, 0.9), (heading, low) => {
        const drive = new BoatDrive();
        const motion = {
          ...initialMotion(heading),
          speed: 0.5,
          waterDrag: low,
        };
        const ctx = context(0, FULL_THROTTLE, { x: 0, z: 0 }, AFLOAT);
        const a = drive.step(motion, FULL_THROTTLE, ctx, SPORTSBOAT_PROFILE);
        const b = drive.step(
          { ...motion, waterDrag: low + 0.04 },
          FULL_THROTTLE,
          ctx,
          SPORTSBOAT_PROFILE,
        );
        expect(a.motion.waterDrag).toBe(low);
        expect(b.motion.waterDrag).toBeCloseTo(low + 0.04, 12);
        expect(length(b.impulse)).toBeLessThan(length(a.impulse));
        const given = a.motion.airExpected;
        if (!given) throw new Error("missing afloat given velocity");
        const observed = { x: given.x * 0.9, z: given.z * 0.9 };
        const next = drive.step(
          a.motion,
          FULL_THROTTLE,
          { ...ctx, velocity: observed },
          SPORTSBOAT_PROFILE,
        );
        expect(next.motion.waterDrag).toBeCloseTo(low * 0.9 + 0.9 * 0.1, 12);
        const beached = drive.step(
          next.motion,
          FULL_THROTTLE,
          { ...ctx, ...BEACHED, velocity: { x: 0, z: 0 } },
          SPORTSBOAT_PROFILE,
        );
        expect(beached.motion.waterDrag).toBe(next.motion.waterDrag);
        expect(beached.motion.airExpected).toBeUndefined();
      }),
    );
  });

  it("is the sports boat's drive and keeps no form, gear, or bank whatever form it is given", () => {
    fc.assert(
      fc.property(fc.constantFrom(...FORMS), yaw, (form, heading) => {
        const drive = driveFor("sportsboat", form);
        expect(drive).toBeInstanceOf(BoatDrive);
        expect([drive.form, drive.wheelsDown, drive.bankAngle]).toStrictEqual([
          "car",
          true,
          0,
        ]);
        const rebuilt = Vehicle.rebuild(
          "boat",
          heading,
          [],
          form,
          "sportsboat",
        );
        expect([
          rebuilt.form,
          rebuilt.wheelsDown,
          rebuilt.bankAngle,
        ]).toStrictEqual(["car", true, 0]);
      }),
    );
  });

  it("afloat at full throttle, rises to the boat's top speed above the SUV's and never exceeds it", () => {
    fc.assert(
      fc.property(yaw, fc.boolean(), afloatWater, (heading, jump, water) => {
        const sim = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
        for (let i = 0; i < 120; i++) {
          sim.step({ ...FULL_THROTTLE, jump }, water);
          expect(length(sim.body.vel)).toBeLessThanOrEqual(
            SPORTSBOAT_PROFILE.motion.maxSpeed + 1e-9,
          );
        }
        expect(length(sim.body.vel)).toBeCloseTo(
          SPORTSBOAT_PROFILE.motion.maxSpeed,
          9,
        );
        expect(sim.vehicle.speed).toBe(SPORTSBOAT_PROFILE.motion.maxSpeed);
        expect(sim.vehicle.speed).toBeGreaterThan(SUV_PROFILE.motion.maxSpeed);
      }),
    );
  });

  it("with water only 0.3 blocks below the feet, drives exactly as with water at the feet", () => {
    fc.assert(
      fc.property(
        yaw,
        waterDepth,
        fc.array(fc.option(rawInput, { nil: undefined }), {
          minLength: 1,
          maxLength: 80,
        }),
        (heading, depth, inputs) => {
          const below = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
          const atFeet = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
          for (const raw of inputs) {
            expect(below.step(raw, WATER_BELOW)).toStrictEqual(
              atFeet.step(raw, { waterDepth: depth }),
            );
          }
        },
      ),
    );
  });

  it("afloat with the stick pulled back, reverses up to the boat's reverse limit", () => {
    fc.assert(
      fc.property(yaw, fc.integer({ min: 1, max: 80 }), (heading, ticks) => {
        const sim = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
        for (let i = 0; i < ticks; i++) {
          sim.step({ moveX: 0, moveY: -1, jump: false }, AFLOAT);
          expect(sim.vehicle.speed).toBeLessThan(0);
          expect(sim.vehicle.speed).toBeGreaterThanOrEqual(
            -SPORTSBOAT_PROFILE.motion.maxReverse,
          );
        }
      }),
    );
  });

  it("afloat at speed, turns against the stick by the profile's turnRate, and the other way in reverse", () => {
    fc.assert(
      fc.property(
        yaw,
        steer,
        fc.constantFrom(1, -1),
        afloatWater,
        (heading, s, direction, water) => {
          const sim = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
          const stick = { moveX: 0, moveY: direction, jump: false };
          // 20 ticks take the boat past steerFullSpeed both ways.
          for (let i = 0; i < 20; i++) sim.step(stick, water);
          const before = sim.vehicle.yaw;
          sim.step({ ...stick, moveX: s }, water);
          expect(
            Math.abs(sim.vehicle.speed) /
              SPORTSBOAT_PROFILE.motion.steerFullSpeed,
          ).toBeGreaterThanOrEqual(1);
          expect(yawDelta(before, sim.vehicle.yaw)).toBeCloseTo(
            -direction * s * SPORTSBOAT_PROFILE.motion.turnRate,
            9,
          );
        },
      ),
    );
  });

  it("steers by whatever turnRate the profile it is given holds", () => {
    fc.assert(
      fc.property(
        yaw,
        steer,
        number(1, 12),
        afloatWater,
        (heading, s, turnRate, water) => {
          const profile = {
            ...SPORTSBOAT_PROFILE,
            motion: { ...SPORTSBOAT_PROFILE.motion, turnRate },
          };
          const motion = { ...initialMotion(heading), speed: 0.5 };
          const out = new BoatDrive().step(
            motion,
            { moveX: s, moveY: 1, jump: false },
            context(0, undefined, { x: 0, z: 0 }, water),
            profile,
          );
          expect(yawDelta(motion.yaw, out.motion.yaw)).toBeCloseTo(
            -s * turnRate,
            9,
          );
        },
      ),
    );
  });

  it("afloat with the stick held sideways, settles at creep speed from rest or from full speed and keeps turning", () => {
    fc.assert(
      fc.property(
        yaw,
        fc.integer({ min: 0, max: 120 }),
        sideways,
        afloatWater,
        (heading, throttleTicks, stick, water) => {
          const sim = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
          for (let i = 0; i < throttleTicks; i++)
            sim.step(FULL_THROTTLE, water);
          for (let i = 0; i < 100; i++) sim.step(stick, water);
          expect(sim.vehicle.speed).toBe(SPORTSBOAT_PROFILE.motion.creepSpeed);
          const before = sim.vehicle.yaw;
          sim.step(stick, water);
          expect(yawDelta(before, sim.vehicle.yaw)).toBeCloseTo(
            -stick.moveX * SPORTSBOAT_PROFILE.motion.turnRate,
            9,
          );
        },
      ),
    );
  });

  it("beached, never gains speed whatever the input and coasts to a stop", () => {
    fc.assert(
      fc.property(
        yaw,
        fc.integer({ min: 0, max: 80 }),
        fc.array(fc.option(rawInput, { nil: undefined }), {
          minLength: 60,
          maxLength: 80,
        }),
        (heading, afloatTicks, inputs) => {
          const sim = new BoatSim(boat(heading), SPEC.defaultFriction);
          for (let i = 0; i < afloatTicks; i++) sim.step(FULL_THROTTLE, AFLOAT);
          let speed = Math.abs(sim.vehicle.speed);
          for (const raw of inputs) {
            sim.step(raw, BEACHED);
            expect(Math.abs(sim.vehicle.speed)).toBeLessThanOrEqual(speed);
            speed = Math.abs(sim.vehicle.speed);
          }
          expect(sim.vehicle.speed).toBe(0);
        },
      ),
    );
  });

  it("never pushes vertically and never sends a form, bank, or gear, for any inputs and surroundings", () => {
    const tick = fc.record({
      raw: fc.option(rawInput, { nil: undefined }),
      waterDepth: fc.option(number(0, 5), { nil: undefined }),
      waterBelow: fc.option(fc.boolean(), { nil: undefined }),
      onGround: fc.boolean(),
      velocity: fc.record({ x: number(-2, 2), z: number(-2, 2) }),
      solid: fc.boolean(),
    });
    fc.assert(
      fc.property(
        yaw,
        fc.array(tick, { minLength: 1, maxLength: 60 }),
        (heading, ticks) => {
          const vehicle = boat(heading);
          ticks.forEach((t, i) => {
            const out = vehicle.tick({
              ...context(i, t.raw, t.velocity, {
                waterDepth: t.waterDepth,
                waterBelow: t.waterBelow,
              }),
              onGround: t.onGround,
              solidAt: () => t.solid,
            });
            expect(out.impulse.y).toBe(0);
            expect(out.form).toBeUndefined();
            expect(out.bank).toBeUndefined();
            expect(out.gearDown).toBeUndefined();
          });
        },
      ),
    );
  });

  it("ignores jump afloat or beached, even with a handbrake grip that differs from its grip", () => {
    // SPORTSBOAT_PROFILE sets handbrakeGrip equal to grip, which would hide a
    // path that reads the handbrake; a differing one makes such a path show.
    const water = fc.oneof(
      afloatWater,
      fc.constant(BEACHED),
      fc.constant<Water>({}),
    );
    fc.assert(
      fc.property(
        yaw,
        number(-0.2, 1.12),
        fc.record({ x: number(-2, 2), z: number(-2, 2) }),
        water,
        fc.boolean(),
        rawInput,
        number(0, 1),
        (heading, speed, velocity, w, onGround, raw, handbrakeGrip) => {
          const profile = {
            ...SPORTSBOAT_PROFILE,
            motion: { ...SPORTSBOAT_PROFILE.motion, handbrakeGrip },
          };
          const motion = { ...initialMotion(heading), speed };
          const ctx = { ...context(0, undefined, velocity, w), onGround };
          const drive = new BoatDrive();
          expect(
            drive.step(motion, { ...raw, jump: true }, ctx, profile),
          ).toStrictEqual(
            drive.step(motion, { ...raw, jump: false }, ctx, profile),
          );
        },
      ),
    );
  });
});

describe("a sports boat Vehicle (ADR 0051)", () => {
  it("rams a target 3.2 blocks ahead at speed and not one 3.6 ahead, while an SUV at the same speed rams neither", () => {
    const drive = (kind: VehicleKind, heading: number, ticks: number) => {
      const vehicle = Vehicle.create(kind, heading, kind);
      const afloat = kind === "sportsboat";
      const sim = new BoatSim(
        vehicle,
        afloat ? SPORTSBOAT_WATER.drag : SPEC.defaultFriction,
      );
      const water = afloat ? AFLOAT : BEACHED;
      for (let i = 0; i < ticks; i++) sim.step(FULL_THROTTLE, water);
      const ahead = (id: string, blocks: number): RamTarget => {
        const f = forward(vehicle.yaw);
        const offset: Vec3 = { x: f.x * blocks, y: 0, z: f.z * blocks };
        return { id, offset, protectedOccupant: false };
      };
      const out = sim.step(FULL_THROTTLE, water, () => [
        ahead("near", 3.2),
        ahead("far", 3.6),
      ]);
      return { speed: vehicle.speed, hits: out.hits.map((h) => h.id) };
    };
    fc.assert(
      fc.property(yaw, fc.integer({ min: 10, max: 35 }), (heading, ticks) => {
        const boatRun = drive("sportsboat", heading, ticks);
        const suvRun = drive("suv", heading, ticks);
        expect(boatRun.speed).toBeGreaterThan(SPEC.ramMinSpeed);
        expect(suvRun.speed).toBeCloseTo(boatRun.speed, 9);
        expect(boatRun.hits).toStrictEqual(["near"]);
        expect(suvRun.hits).toStrictEqual([]);
      }),
    );
  });

  it("seats riders by the SUV's positions and emits SeatVacated without a door when one leaves", () => {
    expect(SPORTSBOAT_PROFILE.seats.positions).toStrictEqual(
      SUV_PROFILE.seats.positions,
    );
    fc.assert(
      fc.property(
        yaw,
        fc.integer({ min: 0, max: 3 }),
        rawInput,
        (heading, seat, raw) => {
          const vehicle = boat(heading);
          const local = SUV_PROFILE.seats.positions[seat];
          if (local === undefined) throw new Error(`no seat ${seat}`);
          const f = forward(heading);
          const left = leftOf(f);
          const rider = {
            id: "rider",
            offset: {
              x: left.x * local.x + f.x * local.z,
              z: left.z * local.x + f.z * local.z,
            },
            yaw: heading,
            raw,
          };
          const seated = vehicle.tick({
            ...context(0, undefined, { x: 0, z: 0 }, AFLOAT),
            riders: [rider],
          });
          expect(seated.driverId).toBe(seat === 0 ? "rider" : undefined);
          const vacated = vehicle.tick(
            context(1, undefined, { x: 0, z: 0 }, AFLOAT),
          );
          expect(vacated.events).toStrictEqual([
            { type: "SeatVacated", vehicleId: "boat", seat },
          ]);
        },
      ),
    );
  });
});
