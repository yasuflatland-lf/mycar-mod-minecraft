import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dot, forward, rightOf } from "../../../src/domain/shared/vec";
import { SPORTSBOAT_MOTION } from "../../../src/domain/vehicle/boatDrive";
import { NEUTRAL_INPUT } from "../../../src/domain/vehicle/driveInput";
import {
  cellKey,
  headlightCells,
} from "../../../src/domain/vehicle/headlights";
import { isVehicleKind, VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import {
  createVehicle,
  rebuildVehicle,
} from "../../../src/domain/vehicle/kinds/index";
import {
  initialMotion,
  stepFlightMotion,
  stepMotion,
  updateSpeed,
} from "../../../src/domain/vehicle/motion";
import {
  PROFILES,
  profileOf,
  SPORTSBOAT_PROFILE,
  SUV_PROFILE,
} from "../../../src/domain/vehicle/profile";
import { selectHits } from "../../../src/domain/vehicle/ram";
import { RAM_QUERY_RADIUS } from "../../../src/domain/vehicle/ramQuery";
import { SEAT_POSITIONS } from "../../../src/domain/vehicle/seats";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { SUV_MOTION } from "../../../src/domain/vehicle/suvDrive";

const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const yaw = fc.integer({ min: -18000, max: 18000 }).map((n) => n / 100);
const limits = fc.record({
  maxSpeed: number(0.2, 4),
  maxReverse: number(0.01, 0.2),
  accel: number(0.001, 0.1),
  reverseAccel: number(0.001, 0.1),
  brake: number(0.001, 0.1),
  drag: number(0.001, 0.1),
  turnRate: number(1, 12),
  steerFullSpeed: number(0.01, 0.2),
  grip: number(0, 1),
  handbrakeGrip: number(0, 1),
  creepSpeed: number(0.01, 0.2),
});
const throttle = number(-1, 1);
const input = fc.record({
  throttle,
  steer: throttle,
  handbrake: fc.boolean(),
  creep: fc.boolean(),
});
const velocity = fc.record({ x: number(-5, 5), z: number(-5, 5) });

describe("vehicle profiles (ADR 0050)", () => {
  it("builds the SUV profile from the existing tuning and seat data", () => {
    expect(SUV_MOTION).toEqual({
      maxSpeed: SPEC.maxSpeed,
      maxReverse: SPEC.maxReverse,
      accel: SPEC.accel,
      reverseAccel: SPEC.reverseAccel,
      brake: SPEC.brake,
      drag: SPEC.drag,
      turnRate: SPEC.turnRate,
      steerFullSpeed: SPEC.steerFullSpeed,
      grip: SPEC.grip,
      handbrakeGrip: SPEC.handbrakeGrip,
      creepSpeed: SPEC.creepSpeed,
    });
    expect(SUV_PROFILE).toEqual({
      kind: "suv",
      ram: { front: SPEC.bodyFront, halfWidth: SPEC.bodyHalfWidth },
      seats: { positions: SEAT_POSITIONS },
      beams: { reach: SPEC.headlightReach, lanes: [0] },
      placement: {
        surfaces: ["top"],
        clearance: { halfX: 1, halfZ: 1, height: 2 },
      },
    });
  });

  it("gives the sports boat its own values from ADR 0051", () => {
    expect(SPORTSBOAT_MOTION).toStrictEqual({
      maxSpeed: 1.12,
      maxReverse: 0.2,
      accel: 0.0225,
      reverseAccel: 0.01125,
      brake: 0.04,
      drag: 0.02,
      turnRate: 6,
      steerFullSpeed: 0.08,
      grip: 0.6,
      handbrakeGrip: 0.6,
      creepSpeed: 0.12,
    });
    expect(SPORTSBOAT_PROFILE).toStrictEqual({
      kind: "sportsboat",
      ram: { front: 3.0, halfWidth: 1.06 },
      seats: {
        positions: [
          { x: -0.38, z: 0.35 },
          { x: 0.38, z: 0.35 },
          { x: -0.38, z: -0.8 },
          { x: 0.38, z: -0.8 },
        ],
      },
      beams: {
        reach: Array.from({ length: 15 }, (_, i) => 4 * (i + 1)),
        lanes: [-3, 3],
      },
      placement: {
        surfaces: ["water", "top"],
        clearance: { halfX: 1, halfZ: 1, height: 2 },
      },
    });
    expect(PROFILES.sportsboat).toBe(SPORTSBOAT_PROFILE);
  });

  it("freezes every profile and motion limit so a write cannot change all vehicles of a kind", () => {
    expect(Object.isFrozen(PROFILES)).toBe(true);
    expect(Object.isFrozen(SUV_MOTION)).toBe(true);
    expect(Object.isFrozen(SPORTSBOAT_MOTION)).toBe(true);
    for (const kind of VEHICLE_KINDS) {
      const profile = profileOf(kind);
      for (const part of [
        profile,
        profile.ram,
        profile.seats,
        profile.beams,
        profile.beams.lanes,
        profile.placement,
      ]) {
        expect(Object.isFrozen(part)).toBe(true);
      }
    }
  });

  it("recognizes exactly the registered kinds and preserves kind when creating or rebuilding", () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        expect(isVehicleKind(value)).toBe(
          VEHICLE_KINDS.some((kind) => kind === value),
        );
      }),
    );
    fc.assert(
      fc.property(fc.constantFrom(...VEHICLE_KINDS), yaw, (kind, heading) => {
        expect(isVehicleKind(kind)).toBe(true);
        expect(profileOf(kind)).toBe(PROFILES[kind]);
        expect(createVehicle(kind, "v", heading).kind).toBe(kind);
        expect(
          rebuildVehicle(kind, "v", heading, [], { form: "car" }).kind,
        ).toBe(kind);
      }),
    );
  });

  it("keeps speed inside the profile limits across arbitrary control sequences", () => {
    fc.assert(
      fc.property(
        limits,
        fc.array(input, { minLength: 1, maxLength: 200 }),
        (motion, inputs) => {
          let speed = 0;
          for (const control of inputs) {
            speed = updateSpeed(speed, control.throttle, control.creep, motion);
            expect(speed).toBeLessThanOrEqual(motion.maxSpeed);
            expect(speed).toBeGreaterThanOrEqual(-motion.maxReverse);
          }
        },
      ),
    );
  });

  it("accelerates above the SUV maximum when the profile allows it", () => {
    fc.assert(
      fc.property(number(1, 4), number(0.001, 0.1), (maxSpeed, accel) => {
        const motion = { ...SUV_MOTION, maxSpeed, accel };
        expect(updateSpeed(SPEC.maxSpeed, 1, false, motion)).toBeGreaterThan(
          SPEC.maxSpeed,
        );
        expect(updateSpeed(maxSpeed, 1, false, motion)).toBe(maxSpeed);
      }),
    );
  });

  it("caps flight speed and velocity at the smaller profile or medium maximum", () => {
    fc.assert(
      fc.property(
        limits,
        number(0.2, 5),
        number(0.5, 1),
        yaw,
        input,
        velocity,
        (motion, mediumMax, drag, heading, control, v) => {
          const maximum = Math.min(motion.maxSpeed, mediumMax);
          const out = stepFlightMotion(
            { ...initialMotion(heading), speed: motion.maxSpeed },
            control,
            v,
            { drag, maxSpeed: mediumMax },
            motion,
          );
          expect(out.state.speed).toBeLessThanOrEqual(maximum);
          expect(
            Math.hypot(
              (v.x + out.impulse.x) * drag,
              (v.z + out.impulse.z) * drag,
            ),
          ).toBeLessThanOrEqual(maximum + 1e-9);
          const full = stepFlightMotion(
            { ...initialMotion(heading), speed: motion.maxSpeed },
            { ...NEUTRAL_INPUT, throttle: 1 },
            { x: 0, z: 0 },
            { drag, maxSpeed: mediumMax },
            motion,
          );
          expect(full.state.speed).toBe(maximum);
          expect(
            Math.hypot(full.impulse.x * drag, full.impulse.z * drag),
          ).toBeCloseTo(maximum, 10);
        },
      ),
    );
  });

  it("uses profile steering and grip on the ground", () => {
    fc.assert(
      fc.property(
        limits,
        yaw,
        throttle,
        fc.boolean(),
        (motion, heading, steer, handbrake) => {
          const speed = motion.maxSpeed / 2;
          const f = forward(heading);
          const right = rightOf(f);
          const v = { x: right.x * 0.1, z: right.z * 0.1 };
          const out = stepMotion(
            { ...initialMotion(heading), speed },
            { ...NEUTRAL_INPUT, steer, handbrake },
            { velocity: v, onGround: true },
            () => 0,
            motion,
          );
          const nextSpeed = Math.max(0, speed - motion.drag);
          const turn =
            steer *
            motion.turnRate *
            Math.min(1, nextSpeed / motion.steerFullSpeed);
          expect(out.forward.x).toBeCloseTo(forward(heading - turn).x, 10);
          expect(out.forward.z).toBeCloseTo(forward(heading - turn).z, 10);
          const sideways = dot(v, rightOf(out.forward));
          const given = {
            x: (v.x + out.impulse.x) * SPEC.defaultFriction,
            z: (v.z + out.impulse.z) * SPEC.defaultFriction,
          };
          expect(dot(given, rightOf(out.forward))).toBeCloseTo(
            sideways * (1 - (handbrake ? motion.handbrakeGrip : motion.grip)),
            10,
          );
        },
      ),
    );
  });

  it("places each beam lane sideways from its reach and deduplicates cells", () => {
    const beams = fc.record({
      reach: fc.array(number(0, 40), { maxLength: 8 }),
      lanes: fc.array(number(-8, 8), { maxLength: 6 }),
    });
    const location = fc.record({
      x: number(-100, 100),
      y: number(-64, 300),
      z: number(-100, 100),
    });
    fc.assert(
      fc.property(beams, location, yaw, (pattern, at, heading) => {
        const out = headlightCells(at, heading, pattern);
        expect(out.length).toBeLessThanOrEqual(
          pattern.reach.length * pattern.lanes.length,
        );
        expect(new Set(out.map(cellKey)).size).toBe(out.length);
        const f = forward(heading);
        const right = rightOf(f);
        const expected = new Set<string>();
        for (const reach of pattern.reach) {
          for (const lane of pattern.lanes) {
            const origin = {
              x: at.x + f.x * reach,
              y: at.y,
              z: at.z + f.z * reach,
            };
            const shifted = {
              x: origin.x + right.x * lane,
              y: origin.y,
              z: origin.z + right.z * lane,
            };
            const single = headlightCells(shifted, heading, {
              reach: [0],
              lanes: [0],
            });
            for (const cell of single) expected.add(cellKey(cell));
          }
        }
        expect(new Set(out.map(cellKey))).toEqual(expected);
      }),
    );
  });

  it("hits just inside a longer body's reach and misses just outside", () => {
    fc.assert(
      fc.property(
        number(2, 10),
        number(0.1, 3),
        number(0.0001, 0.05),
        yaw,
        fc.boolean(),
        (front, halfWidth, gap, heading, reversing) => {
          const f = forward(heading);
          const direction = reversing ? -1 : 1;
          const target = (id: string, ahead: number) => ({
            id,
            offset: {
              x: f.x * ahead * direction,
              y: 0,
              z: f.z * ahead * direction,
            },
            protectedOccupant: false,
          });
          const reach = front + SPEC.targetHalfWidth;
          const targets = [
            target("inside", reach - gap),
            target("outside", reach + gap),
          ];
          expect(
            selectHits(f, direction * SPEC.maxReverse, targets, new Map(), 0, {
              front,
              halfWidth,
            }).map((hit) => hit.id),
          ).toEqual(["inside"]);
          expect(
            selectHits(
              f,
              direction * SPEC.maxReverse,
              targets,
              new Map(),
              0,
              SUV_PROFILE.ram,
            ),
          ).toEqual([]);
        },
      ),
    );
  });

  it("hits just inside a body's half width and misses just outside", () => {
    fc.assert(
      fc.property(
        number(2, 10),
        number(0.1, 3),
        number(0.0001, 0.05),
        number(0.05, 0.95),
        yaw,
        fc.boolean(),
        fc.boolean(),
        (front, halfWidth, gap, aheadRatio, heading, reversing, leftSide) => {
          const f = forward(heading);
          const right = rightOf(f);
          const direction = reversing ? -1 : 1;
          const ahead = (front + SPEC.targetHalfWidth) * aheadRatio * direction;
          const sign = leftSide ? -1 : 1;
          const target = (id: string, side: number) => ({
            id,
            offset: {
              x: f.x * ahead + right.x * side * sign,
              y: 0,
              z: f.z * ahead + right.z * side * sign,
            },
            protectedOccupant: false,
          });
          const width = halfWidth + SPEC.targetHalfWidth;
          const targets = [
            target("inside", width - gap),
            target("outside", width + gap),
          ];
          expect(
            selectHits(f, direction * SPEC.maxReverse, targets, new Map(), 0, {
              front,
              halfWidth,
            }).map((hit) => hit.id),
          ).toEqual(["inside"]);
        },
      ),
    );
  });

  it("clamps the speed left after a wall hit to the profile reverse limit", () => {
    // Faster than the vehicle forward, but pushed backward by the wall harder
    // than the profile may reverse, so only the profile's limit can bound it.
    const wallCase = fc
      .tuple(limits, number(0, 1), number(0.01, 0.99))
      .map(([motion, reverse, ratio]) => {
        const maxSpeed = Math.max(motion.maxSpeed, motion.maxReverse + 0.1);
        const maxReverse = motion.maxReverse * (0.1 + 0.9 * reverse);
        const vLong = -(maxReverse + (maxSpeed - maxReverse) * ratio);
        return { motion: { ...motion, maxSpeed, maxReverse }, vLong };
      });
    const pushed = { ...NEUTRAL_INPUT, throttle: 1 };
    fc.assert(
      fc.property(wallCase, yaw, ({ motion, vLong }, heading) => {
        const f = forward(heading);
        const aimed = {
          x: f.x * motion.maxSpeed * 4,
          z: f.z * motion.maxSpeed * 4,
        };
        const v = { x: f.x * vLong, z: f.z * vLong };
        const start = { ...initialMotion(heading), speed: motion.maxSpeed };
        const ground = stepMotion(
          { ...start, expected: aimed },
          pushed,
          { velocity: v, onGround: true },
          () => 0,
          motion,
        );
        const flight = stepFlightMotion(
          { ...start, airExpected: aimed },
          pushed,
          v,
          { drag: 1, maxSpeed: 5 },
          motion,
        );
        for (const out of [ground, flight]) {
          expect(out.blocked).toBe(true);
          expect(out.state.speed).toBe(-motion.maxReverse);
        }
      }),
    );
  });

  it("queries every profile's hit box including its far corners", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VEHICLE_KINDS),
        yaw,
        number(0, 1),
        number(-1, 1),
        number(0, 1),
        fc.boolean(),
        (kind, heading, aheadRatio, sideRatio, heightRatio, reverse) => {
          const body = profileOf(kind).ram;
          const f = forward(heading);
          const right = rightOf(f);
          const ahead =
            (body.front + SPEC.targetHalfWidth) *
            aheadRatio *
            (reverse ? -1 : 1);
          const side = (body.halfWidth + SPEC.targetHalfWidth) * sideRatio;
          const y =
            SPEC.ramMinDy + (SPEC.ramMaxDy - SPEC.ramMinDy) * heightRatio;
          expect(
            Math.hypot(
              f.x * ahead + right.x * side,
              y,
              f.z * ahead + right.z * side,
            ),
          ).toBeLessThanOrEqual(RAM_QUERY_RADIUS + 1e-9);
          expect(
            Math.hypot(
              body.front + SPEC.targetHalfWidth,
              body.halfWidth + SPEC.targetHalfWidth,
              Math.max(Math.abs(SPEC.ramMinDy), Math.abs(SPEC.ramMaxDy)),
            ),
          ).toBeLessThanOrEqual(RAM_QUERY_RADIUS);
        },
      ),
    );
  });
});
