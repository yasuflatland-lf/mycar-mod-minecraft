import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dot,
  forward,
  leftOf,
  normalizeYaw,
  rightOf,
  type Vec2,
  type Vec3,
} from "../../../src/domain/shared/vec";
import type { Drive } from "../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../src/domain/vehicle/driveInput";
import {
  createVehicle,
  rebuildVehicle,
} from "../../../src/domain/vehicle/kinds/index";
import { SPORTSBOAT_PROFILE } from "../../../src/domain/vehicle/kinds/sportsboat/profile";
import { DOOR_BY_SEAT } from "../../../src/domain/vehicle/kinds/suv/entity";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../../src/domain/vehicle/kinds/suv/spec";
import { MOTION } from "../../../src/domain/vehicle/motion/constants";
import { STEP_LANES } from "../../../src/domain/vehicle/motion/stepUp";
import type { RamTarget } from "../../../src/domain/vehicle/ram";
import { SPEC } from "../../../src/domain/vehicle/spec";
import {
  type RiderView,
  Vehicle,
  type VehicleTickInput,
} from "../../../src/domain/vehicle/vehicle";
import { defined } from "../../support/defined";
import { propertyValue } from "../../support/engineCommands";
import { engineStep } from "../../support/engineModel";
import { waterSensors } from "../../support/waterDepth";

const FORWARD: RawInput = { moveX: 0, moveY: 1, jump: false };
const IDLE: RawInput = { moveX: 0, moveY: 0, jump: false };
const GROUND_FRICTION = 0.688;
/**
 * From standstill the look-ahead first reaches a step 8 blocks ahead on this
 * tick, and the car is still short of it, so a probe can only find the step
 * by looking ahead, not by standing inside it.
 */
const STEP_REACH_TICKS = 19;

function seatOffset(yaw: number, seat: number): Vec2 {
  const f = forward(yaw);
  const l = leftOf(f);
  const s = defined(SUV_PROFILE.seats.positions[seat], `seat ${seat}`);
  return { x: l.x * s.x + f.x * s.z, z: l.z * s.x + f.z * s.z };
}

/** Signed difference a - b wrapped into [-180, 180). */
function yawDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/**
 * A step `height` blocks tall, 3 deep and 3 wide, centered on the line along
 * `yaw` from the origin and starting `distance` blocks ahead. `p` is in world
 * space, y from the feet of the vehicle. The narrow width makes a probe that
 * maps vehicle axes to the wrong world axes miss the step.
 */
function stepAhead(yaw: number, distance: number, height: number) {
  const f = forward(yaw);
  return (p: Vec3) => {
    const ahead = dot({ x: p.x, z: p.z }, f);
    const side = dot({ x: p.x, z: p.z }, leftOf(f));
    return (
      ahead >= distance &&
      ahead < distance + 3 &&
      Math.abs(side) <= 1.5 &&
      p.y >= 0 &&
      p.y < height
    );
  };
}

/**
 * A step `height` blocks tall and 3 deep, starting `distance` blocks ahead
 * along `yaw`, but only 0.8 blocks wide around the look-ahead lane `lane`
 * (positive is the vehicle's right), so the other two lanes miss it.
 */
function stepOnLane(
  yaw: number,
  distance: number,
  height: number,
  lane: number,
) {
  const f = forward(yaw);
  return (p: Vec3) => {
    const ahead = dot({ x: p.x, z: p.z }, f);
    const side = dot({ x: p.x, z: p.z }, rightOf(f));
    return (
      ahead >= distance &&
      ahead < distance + 3 &&
      Math.abs(side - lane) <= 0.4 &&
      p.y >= 0 &&
      p.y < height
    );
  };
}

/** A world with one vehicle, driven by the simplified engine model. */
class Sim {
  pos: Vec2 = { x: 0, z: 0 };
  vel: Vec2 = { x: 0, z: 0 };
  yaw = 0;
  riders: { id: string; seat: number; yaw: number; raw: RawInput }[] = [];
  testInput: RawInput | undefined;
  targets: RamTarget[] = [];
  hits: string[] = [];
  events: string[] = [];
  impulseY: number[] = [];
  /** Whether the world point is solid (world axes, y from the vehicle's feet). */
  solid: (p: Vec3) => boolean = () => false;

  run(v: Vehicle, ticks: number, from = 0) {
    for (let t = from; t < from + ticks; t++) {
      const riders: RiderView[] = this.riders.map((r) => ({
        id: r.id,
        offset: seatOffset(this.yaw, r.seat),
        yaw: r.yaw,
        raw: r.raw,
      }));
      const ctx: VehicleTickInput = {
        deckSeatInputs: [],
        tick: t,
        riders,
        testInput: this.testInput,
        velocity: { ...this.vel, y: 0 },
        onGround: true,
        ...waterSensors(),
        solidAt: (o) =>
          this.solid({ x: this.pos.x + o.x, y: o.y, z: this.pos.z + o.z }),
        targets: () => this.targets,
      };
      const out = v.tick(ctx);
      const r = engineStep(
        { pos: this.pos, vel: this.vel },
        { x: out.impulse.x, z: out.impulse.z },
        { mu: GROUND_FRICTION },
      );
      this.pos = r.body.pos;
      this.vel = r.body.vel;
      this.yaw = out.yaw;
      this.impulseY.push(out.impulse.y);
      this.hits.push(...out.hits.map((h) => h.id));
      this.events.push(
        ...out.seatCommands
          .filter((c) => c.type === "playAnimation")
          .map(
            (c) =>
              `vacated:${DOOR_BY_SEAT.indexOf(c.name as (typeof DOOR_BY_SEAT)[number])}:${c.name}`,
          ),
      );
    }
  }
}

describe("Vehicle (aggregate)", () => {
  it("moves forward when the rider in the driver's seat presses the accelerator", () => {
    const sim = new Sim();
    sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: FORWARD }];
    sim.run(createVehicle("suv", "car", 0), 40);
    expect(sim.pos.z).toBeGreaterThan(5);
  });

  it("uses the driver's input ahead of conflicting test input", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.5, max: 1, noNaN: true }), (throttle) => {
        const vehicle = createVehicle("suv", "car", 0);
        const out = vehicle.tick({
          deckSeatInputs: [],
          tick: 0,
          riders: [
            {
              id: "driver",
              offset: defined(SUV_PROFILE.seats.positions[0], "driver seat"),
              yaw: 0,
              raw: { ...FORWARD, moveY: throttle },
            },
          ],
          testInput: { ...IDLE, moveY: -1 },
          velocity: { x: 0, y: 0, z: 0 },
          onGround: true,
          ...waterSensors(),
          solidAt: () => false,
          targets: () => [],
        });
        expect(out.driverId).toBe("driver");
        expect(vehicle.speed).toBeGreaterThan(0);
        expect(out.impulse.z).toBeGreaterThan(0);
      }),
    );
  });

  it("cannot be driven by a passenger alone", () => {
    const sim = new Sim();
    sim.riders = [{ id: "p", seat: 1, yaw: 0, raw: FORWARD }];
    sim.run(createVehicle("suv", "car", 0), 40);
    expect(Math.hypot(sim.pos.x, sim.pos.z)).toBeLessThan(0.01);
  });

  it("aligns the vehicle's heading with the driver's view when boarding while stopped", () => {
    const sim = new Sim();
    sim.riders = [{ id: "d", seat: 0, yaw: 120, raw: IDLE }];
    const v = createVehicle("suv", "car", 0);
    sim.run(v, 1);
    expect(v.yaw).toBeCloseTo(120);
  });

  it("keeps the heading when a seated driver looks around while stopped", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.array(fc.double({ min: -180, max: 180, noNaN: true }), {
          minLength: 1,
          maxLength: 5,
        }),
        (boardYaw, laterYaws) => {
          const sim = new Sim();
          const v = createVehicle("suv", "car", 0);
          sim.riders = [{ id: "d", seat: 0, yaw: boardYaw, raw: IDLE }];
          sim.run(v, 1);
          laterYaws.forEach((yaw, i) => {
            sim.riders = [{ id: "d", seat: 0, yaw, raw: IDLE }];
            sim.run(v, 1, i + 1);
          });
          expect(yawDiff(v.yaw, boardYaw)).toBeCloseTo(0);
        },
      ),
    );
  });

  it("does not snap a moving vehicle's heading to a new driver's view", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 350, noNaN: true }),
        (viewOffset) => {
          const sim = new Sim();
          const v = createVehicle("suv", "car", 0);
          sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: FORWARD }];
          sim.run(v, 20);
          expect(Math.abs(v.speed)).toBeGreaterThan(MOTION.mountAlignSpeed);
          sim.riders = [
            { id: "e", seat: 0, yaw: normalizeYaw(viewOffset), raw: FORWARD },
          ];
          sim.run(v, 1, 20);
          expect(yawDiff(v.yaw, 0)).toBeCloseTo(0);
        },
      ),
    );
  });

  it("jumps up a one- or two-block step ahead in any heading, but never at a three-block wall", () => {
    fc.assert(
      fc.property(fc.double({ min: -180, max: 180, noNaN: true }), (yaw) => {
        const stepDistance = 8;
        const drive = (height: number) => {
          const sim = new Sim();
          sim.yaw = yaw;
          sim.solid = stepAhead(yaw, stepDistance, height);
          sim.riders = [{ id: "d", seat: 0, yaw, raw: FORWARD }];
          sim.run(createVehicle("suv", "car", yaw), STEP_REACH_TICKS);
          expect(dot(sim.pos, forward(yaw))).toBeLessThan(
            stepDistance - SUV_SPEC.hitboxFront,
          );
          return sim.impulseY;
        };
        expect(drive(2)).toContain(MOTION.stepVelocity);
        expect(drive(1)).toContain(MOTION.oneStepVelocity);
        expect(drive(3).every((y) => y === 0)).toBe(true);
      }),
    );
  });

  it("jumps up a step that only one look-ahead lane reaches, in any heading (ADR 0004)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -180, max: 179 }),
        fc.constantFrom(...STEP_LANES),
        (yaw, lane) => {
          const sim = new Sim();
          sim.yaw = yaw;
          sim.solid = stepOnLane(yaw, 8, 2, lane);
          sim.riders = [{ id: "d", seat: 0, yaw, raw: FORWARD }];
          sim.run(createVehicle("suv", "car", yaw), STEP_REACH_TICKS);
          expect(dot(sim.pos, forward(yaw))).toBeLessThan(
            8 - SUV_SPEC.hitboxFront,
          );
          expect(sim.impulseY).toContain(MOTION.stepVelocity);
        },
      ),
    );
  });

  it("never jumps up a step while a ceiling hangs right above the roof, in any heading", () => {
    fc.assert(
      fc.property(fc.integer({ min: -180, max: 179 }), (yaw) => {
        const stepDistance = 8;
        const f = forward(yaw);
        const step = stepAhead(yaw, stepDistance, 2);
        const sim = new Sim();
        sim.yaw = yaw;
        // A ceiling 2 to 3 blocks up over the approach, ending where the step starts.
        sim.solid = (p) => {
          const ahead = dot({ x: p.x, z: p.z }, f);
          const side = dot({ x: p.x, z: p.z }, leftOf(f));
          const ceiling =
            ahead > -10 &&
            ahead < stepDistance &&
            Math.abs(side) <= 2 &&
            p.y >= 2 &&
            p.y < 3;
          return ceiling || step(p);
        };
        sim.riders = [{ id: "d", seat: 0, yaw, raw: FORWARD }];
        sim.run(createVehicle("suv", "car", yaw), STEP_REACH_TICKS);
        expect(sim.impulseY.every((y) => y === 0)).toBe(true);
      }),
    );
  });

  it("a rebuilt vehicle is driven by the rider in the driver's seat, whatever order the riders come in (ADR 0019)", () => {
    fc.assert(
      fc.property(
        fc.subarray([1, 2, 3], { minLength: 1 }),
        fc.nat(),
        (passengerSeats, at) => {
          const sim = new Sim();
          const passengers = passengerSeats.map((seat) => ({
            id: `p${seat}`,
            seat,
            yaw: 0,
            raw: IDLE,
          }));
          const i = at % (passengers.length + 1);
          sim.riders = [
            ...passengers.slice(0, i),
            { id: "d", seat: 0, yaw: 0, raw: FORWARD },
            ...passengers.slice(i),
          ];
          const riders: RiderView[] = sim.riders.map((r) => ({
            id: r.id,
            offset: seatOffset(0, r.seat),
            yaw: r.yaw,
            raw: r.raw,
          }));
          const v = rebuildVehicle("suv", "car", 0, riders, {});
          sim.run(v, 40);
          expect(sim.pos.z).toBeGreaterThan(5);
        },
      ),
    );
  });

  it("aligns the heading with a boarding driver's view only below mountAlignSpeed", () => {
    // One tick of this throttle from a standstill gives exactly mountAlignSpeed.
    const creep: RawInput = {
      moveX: 0,
      moveY: (MOTION.mountAlignSpeed / SUV_SPEC.accel) * SPEC.throttleFullAt,
      jump: false,
    };
    const board = (raw: RawInput) => {
      const sim = new Sim();
      const v = createVehicle("suv", "car", 0);
      sim.testInput = raw;
      sim.run(v, 1);
      const speed = v.speed;
      sim.riders = [{ id: "d", seat: 0, yaw: 90, raw: IDLE }];
      sim.run(v, 1, 1);
      return { speed, yaw: v.yaw };
    };
    expect(board(creep)).toEqual({ speed: MOTION.mountAlignSpeed, yaw: 0 });
    const slower = board({ ...creep, moveY: creep.moveY * 0.99 });
    expect(slower.speed).toBeLessThan(MOTION.mountAlignSpeed);
    expect(slower.yaw).toBeCloseTo(90);
  });

  it("keeps the heading when a driver boards a vehicle reversing faster than mountAlignSpeed (ADR 0019)", () => {
    const sim = new Sim();
    const v = createVehicle("suv", "car", 0);
    sim.testInput = { moveX: 0, moveY: -1, jump: false };
    let tick = 0;
    for (; tick < 40 && v.speed >= -MOTION.mountAlignSpeed; tick++) {
      sim.run(v, 1, tick);
    }
    expect(v.speed).toBeLessThan(-MOTION.mountAlignSpeed);
    const yaw = v.yaw;
    sim.riders = [{ id: "d", seat: 0, yaw: yaw + 90, raw: IDLE }];
    sim.run(v, 1, tick);
    expect(v.yaw).toBe(yaw);
  });

  it("does not query nearby targets at exactly ramMinSpeed, as when creeping up a step (ADR 0006)", () => {
    // A step jump raises a slower vehicle to stepMinSpeed, which equals
    // ramMinSpeed, so creeping up a step reaches the threshold exactly.
    const v = createVehicle("suv", "car", 0);
    let vel: Vec2 = { x: 0, z: 0 };
    let pos: Vec2 = { x: 0, z: 0 };
    const step = stepAhead(0, 3, 1);
    for (let tick = 0; tick < 40; tick++) {
      let queried = false;
      const at = pos;
      const out = v.tick({
        tick,
        riders: [],
        deckSeatInputs: [],
        testInput: { moveX: 0, moveY: 0.2, jump: false },
        velocity: { ...vel, y: 0 },
        onGround: true,
        ...waterSensors(),
        solidAt: (o) => step({ x: at.x + o.x, y: o.y, z: at.z + o.z }),
        targets: () => {
          queried = true;
          return [];
        },
      });
      if (out.impulse.y > 0) {
        expect(v.speed).toBe(SPEC.ramMinSpeed);
        expect(queried).toBe(false);
        return;
      }
      const r = engineStep(
        { pos, vel },
        { x: out.impulse.x, z: out.impulse.z },
        { mu: GROUND_FRICTION },
      );
      pos = r.body.pos;
      vel = r.body.vel;
    }
    expect.unreachable("the vehicle never jumped the step");
  });

  it("queries nearby targets only while faster than ramMinSpeed (ADR 0006)", () => {
    fc.assert(
      fc.property(
        // Each throttle is held for a while, so runs reach both sides of
        // ramMinSpeed, forward and in reverse.
        fc.array(
          fc.record({
            moveY: fc.oneof(
              fc.constantFrom(-1, 1),
              fc.double({ min: -1, max: 1, noNaN: true }),
            ),
            ticks: fc.integer({ min: 1, max: 30 }),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        (phases) => {
          const moveYs = phases.flatMap((p) =>
            Array<number>(p.ticks).fill(p.moveY),
          );
          const v = createVehicle("suv", "car", 0);
          let vel: Vec2 = { x: 0, z: 0 };
          let pos: Vec2 = { x: 0, z: 0 };
          moveYs.forEach((moveY, tick) => {
            let queried = false;
            const out = v.tick({
              tick,
              riders: [],
              deckSeatInputs: [],
              testInput: { moveX: 0, moveY, jump: false },
              velocity: { ...vel, y: 0 },
              onGround: true,
              ...waterSensors(),
              solidAt: () => false,
              targets: () => {
                queried = true;
                return [];
              },
            });
            const r = engineStep(
              { pos, vel },
              { x: out.impulse.x, z: out.impulse.z },
              { mu: GROUND_FRICTION },
            );
            pos = r.body.pos;
            vel = r.body.vel;
            expect(queried).toBe(Math.abs(v.speed) > SPEC.ramMinSpeed);
          });
        },
      ),
    );
  });

  it("keeps the driver while they ride, even when their position reads as another seat for a tick (ADR 0025)", () => {
    const sim = new Sim();
    const v = createVehicle("suv", "car", 0);
    sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: FORWARD }];
    sim.run(v, 10);
    sim.riders = [{ id: "d", seat: 1, yaw: 0, raw: FORWARD }];
    sim.run(v, 1, 10);
    expect(v.flipHeadlightSwitch("d", 100)).toBe(true);
  });

  it("makes the passenger who moved up to the driver's seat the driver once the driver leaves", () => {
    const sim = new Sim();
    const v = createVehicle("suv", "car", 0);
    sim.riders = [
      { id: "d", seat: 0, yaw: 0, raw: IDLE },
      { id: "p", seat: 1, yaw: 0, raw: IDLE },
    ];
    sim.run(v, 5);
    sim.riders = [{ id: "p", seat: 0, yaw: 0, raw: IDLE }];
    sim.run(v, 1, 5);
    expect(v.flipHeadlightSwitch("p", 100)).toBe(true);
  });

  it("when the driver disappears (e.g. disconnects), emits the driver's door event once and the vehicle coasts to a stop", () => {
    const sim = new Sim();
    const v = createVehicle("suv", "car", 0);
    sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: FORWARD }];
    sim.run(v, 40);
    sim.riders = [];
    sim.run(v, 200, 40);
    expect(sim.events).toEqual(["vacated:0:door_fr"]);
    expect(Math.hypot(sim.vel.x, sim.vel.z)).toBeLessThan(0.01);
  });

  it("moves on the test input when there is no driver", () => {
    const sim = new Sim();
    sim.testInput = FORWARD;
    sim.run(createVehicle("suv", "car", 0), 40);
    expect(sim.pos.z).toBeGreaterThan(5);
  });

  it("rams a target ahead, and does not hit the same target again within 10 ticks", () => {
    const sim = new Sim();
    sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: FORWARD }];
    sim.targets = [
      { id: "cow", offset: { x: 0, y: 0, z: 1.5 }, protectedOccupant: false },
    ];
    sim.run(createVehicle("suv", "car", 0), 40);
    expect(sim.hits.length).toBeGreaterThan(0);
    expect(sim.hits.length).toBeLessThanOrEqual(4);
  });

  it("an empty vehicle breaks after 3 hits, but not while occupied", () => {
    const empty = createVehicle("suv", "a", 0);
    new Sim().run(empty, 1);
    expect(
      [empty.receiveHit(1), empty.receiveHit(2), empty.receiveHit(3)].map(
        (e) => e.length,
      ),
    ).toEqual([0, 0, 1]);

    const sim = new Sim();
    sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: IDLE }];
    const occupied = createVehicle("suv", "b", 0);
    sim.run(occupied, 1);
    expect([1, 2, 3, 4].flatMap((t) => occupied.receiveHit(t))).toEqual([]);
  });

  it("a rebuilt vehicle keeps its heading and emits no seat events on its first tick with riders already seated", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.subarray([1, 2, 3]),
        (yaw, viewYaw, passengerSeats) => {
          const sim = new Sim();
          sim.yaw = yaw;
          sim.riders = [
            { id: "d", seat: 0, yaw: viewYaw, raw: IDLE },
            ...passengerSeats.map((seat) => ({
              id: `p${seat}`,
              seat,
              yaw: viewYaw,
              raw: IDLE,
            })),
          ];
          const riders: RiderView[] = sim.riders.map((r) => ({
            id: r.id,
            offset: seatOffset(yaw, r.seat),
            yaw: r.yaw,
            raw: r.raw,
          }));
          const v = rebuildVehicle("suv", "car", yaw, riders, {});
          sim.run(v, 1);
          const turned = ((((v.yaw - yaw) % 360) + 540) % 360) - 180;
          expect(turned).toBeCloseTo(0);
          expect(sim.events).toEqual([]);
        },
      ),
    );
  });
});

describe("Vehicle headlight switch (ADR 0020)", () => {
  const driver: RiderView = {
    id: "d",
    offset: seatOffset(0, 0),
    yaw: 0,
    raw: IDLE,
  };
  const passenger: RiderView = {
    id: "p",
    offset: seatOffset(0, 1),
    yaw: 0,
    raw: IDLE,
  };

  it("flips only for the driver", () => {
    const v = rebuildVehicle("suv", "v", 0, [driver, passenger], {});
    expect(v.flipHeadlightSwitch("p", 0)).toBe(false);
    expect(v.flipHeadlightSwitch("outsider", 0)).toBe(false);
    expect(v.flipHeadlightSwitch("d", 0)).toBe(true);
  });

  it("does not flip for anyone when nobody drives", () => {
    expect(createVehicle("suv", "v", 0).flipHeadlightSwitch("d", 0)).toBe(
      false,
    );
  });

  it("flips only on a use that follows a cooldown of idle switch", () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(fc.integer({ min: 0, max: 200 }))
          .map((t) => t.sort((a, b) => a - b)),
        (ticks) => {
          const v = rebuildVehicle("suv", "v", 0, [driver], {});
          ticks.forEach((t, i) => {
            const idle =
              i === 0 ||
              t - defined(ticks[i - 1], "previous use") >=
                SPEC.headlightSwitchCooldown;
            expect(v.flipHeadlightSwitch("d", t)).toBe(idle);
          });
        },
      ),
    );
  });
});

describe("Vehicle water depth context", () => {
  it("passes submerged depth to the form transition and emits it only once", () => {
    fc.assert(
      fc.property(
        fc.double({
          min: SUV_SPEC.carHeight,
          max: SUV_SPEC.carHeight + 1,
          noNaN: true,
        }),
        (waterDepth) => {
          const vehicle = createVehicle("suv", "car", 0);
          const ctx: VehicleTickInput = {
            deckSeatInputs: [],
            tick: 0,
            riders: [],
            velocity: { x: 0, y: 0, z: 0 },
            onGround: true,
            ...waterSensors(waterDepth),
            solidAt: () => false,
            targets: () => [],
          };
          const out = vehicle.tick(ctx);
          expect(propertyValue(out.commands, "form")).toBe("submarine");
          expect(out.riders.underwater).toBe(true);
          expect(
            propertyValue(vehicle.tick({ ...ctx, tick: 1 }).commands, "form"),
          ).toBeUndefined();
        },
      ),
    );
  });

  it("treats dry cells as dry", () => {
    const vehicle = rebuildVehicle("suv", "car", 0, [], { form: "submarine" });
    expect(
      propertyValue(
        vehicle.tick({
          deckSeatInputs: [],
          tick: 0,
          riders: [],
          velocity: { x: 0, y: 0, z: 0 },
          onGround: false,
          ...waterSensors(),
          solidAt: () => false,
          targets: () => [],
        }).commands,
        "form",
      ),
    ).toBe("car");
  });
});

it("concatenates seat commands in seat order when multiple riders leave", () => {
  const vehicle = rebuildVehicle(
    "suv",
    "v",
    0,
    [3, 1, 2, 0].map((seat) => ({
      id: `r${seat}`,
      offset: seatOffset(0, seat),
      yaw: 0,
      raw: IDLE,
    })),
    {},
  );
  const out = vehicle.tick({
    deckSeatInputs: [],
    tick: 0,
    riders: [],
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    ...waterSensors(),
    solidAt: () => false,
    targets: () => [],
  });
  expect(out.seatCommands).toStrictEqual(
    DOOR_BY_SEAT.flatMap((name) => [
      { type: "playAnimation", name },
      { type: "playSound", name: "random.door_open" },
    ]),
  );
});

it("blanks only the occupied dock seat in the outcome", () => {
  const seats = [
    { x: 1, y: 2, z: 3 },
    { x: 4, y: 5, z: 6 },
    { x: 7, y: 8, z: 9 },
    { x: 10, y: 11, z: 12 },
  ];
  const drive: Drive = {
    speed: 0,
    yaw: 0,
    onDriverMounted() {},
    onSeatVacated: () => [],
    step: () => ({
      impulse: { x: 0, y: 0, z: 0 },
      forward: { x: 0, z: 1 },
      commands: [],
      riders: { thirdPerson: false, underwater: false },
      dock: { hold: { x: 0, y: 0, z: 0, yaw: 0 }, floor: [], seats },
    }),
  };
  const vehicle = new Vehicle("v", SPORTSBOAT_PROFILE, drive);
  const outcome = vehicle.tick({
    tick: 0,
    riders: [
      {
        id: "r",
        offset: defined(SPORTSBOAT_PROFILE.seats.positions[2], "seat 2"),
        yaw: 0,
        raw: IDLE,
      },
    ],
    deckSeatInputs: [],
    velocity: { x: 0, y: 0, z: 0 },
    onGround: false,
    ...waterSensors(),
    solidAt: () => false,
    targets: () => [],
  });
  expect(outcome.dock?.seats[2]).toBeUndefined();
  for (const seat of [0, 1, 3])
    expect(outcome.dock?.seats[seat]).toEqual(seats[seat]);
});
