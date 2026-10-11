import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dot,
  forward,
  leftOf,
  normalizeYaw,
  type Vec2,
  type Vec3,
} from "../../src/domain/shared/vec";
import type { RawInput } from "../../src/domain/vehicle/driveInput";
import type { RamTarget } from "../../src/domain/vehicle/ram";
import { SEAT_POSITIONS } from "../../src/domain/vehicle/seats";
import { SPEC } from "../../src/domain/vehicle/spec";
import {
  type RiderView,
  type TickContext,
  Vehicle,
} from "../../src/domain/vehicle/vehicle";
import { defined } from "../support/defined";
import { engineStep } from "../support/engineModel";

const FORWARD: RawInput = { moveX: 0, moveY: 1, jump: false };
const IDLE: RawInput = { moveX: 0, moveY: 0, jump: false };
const GROUND_FRICTION = 0.688;

function seatOffset(yaw: number, seat: number): Vec2 {
  const f = forward(yaw);
  const l = leftOf(f);
  const s = defined(SEAT_POSITIONS[seat], `seat ${seat}`);
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
      const ctx: TickContext = {
        tick: t,
        riders,
        testInput: this.testInput,
        velocity: this.vel,
        onGround: true,
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
        ...out.events.map((e) =>
          e.type === "SeatVacated" ? `vacated:${e.seat}:${e.door}` : e.type,
        ),
      );
    }
  }
}

describe("Vehicle (aggregate)", () => {
  it("moves forward when the rider in the driver's seat presses the accelerator", () => {
    const sim = new Sim();
    sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: FORWARD }];
    sim.run(Vehicle.create("car", 0), 40);
    expect(sim.pos.z).toBeGreaterThan(5);
  });

  it("cannot be driven by a passenger alone", () => {
    const sim = new Sim();
    sim.riders = [{ id: "p", seat: 1, yaw: 0, raw: FORWARD }];
    sim.run(Vehicle.create("car", 0), 40);
    expect(Math.hypot(sim.pos.x, sim.pos.z)).toBeLessThan(0.01);
  });

  it("aligns the vehicle's heading with the driver's view when boarding while stopped", () => {
    const sim = new Sim();
    sim.riders = [{ id: "d", seat: 0, yaw: 120, raw: IDLE }];
    const v = Vehicle.create("car", 0);
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
          const v = Vehicle.create("car", 0);
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
          const v = Vehicle.create("car", 0);
          sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: FORWARD }];
          sim.run(v, 20);
          expect(Math.abs(v.speed)).toBeGreaterThan(SPEC.mountAlignSpeed);
          sim.riders = [
            { id: "e", seat: 0, yaw: normalizeYaw(viewOffset), raw: FORWARD },
          ];
          sim.run(v, 1, 20);
          expect(yawDiff(v.yaw, 0)).toBeCloseTo(0);
        },
      ),
    );
  });

  it("jumps up a two-block step ahead in any heading, but never at a three-block wall", () => {
    fc.assert(
      fc.property(fc.double({ min: -180, max: 180, noNaN: true }), (yaw) => {
        const stepDistance = 8;
        const drive = (height: number) => {
          const sim = new Sim();
          sim.yaw = yaw;
          sim.solid = stepAhead(yaw, stepDistance, height);
          sim.riders = [{ id: "d", seat: 0, yaw, raw: FORWARD }];
          // From standstill the look-ahead first reaches the step on tick 19,
          // and the car is still short of it, so a probe can only find the
          // step by looking ahead, not by standing inside it.
          sim.run(Vehicle.create("car", yaw), 19);
          expect(dot(sim.pos, forward(yaw))).toBeLessThan(
            stepDistance - SPEC.hitboxFront,
          );
          return sim.impulseY;
        };
        expect(drive(2)).toContain(SPEC.stepVelocity);
        expect(drive(3).every((y) => y === 0)).toBe(true);
      }),
    );
  });

  it("keeps the driver while they ride, even when their position reads as another seat for a tick (ADR 0025)", () => {
    const sim = new Sim();
    const v = Vehicle.create("car", 0);
    sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: FORWARD }];
    sim.run(v, 10);
    sim.riders = [{ id: "d", seat: 1, yaw: 0, raw: FORWARD }];
    sim.run(v, 1, 10);
    expect(v.flipHeadlightSwitch("d", 100)).toBe(true);
  });

  it("makes the passenger who moved up to the driver's seat the driver once the driver leaves", () => {
    const sim = new Sim();
    const v = Vehicle.create("car", 0);
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
    const v = Vehicle.create("car", 0);
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
    sim.run(Vehicle.create("car", 0), 40);
    expect(sim.pos.z).toBeGreaterThan(5);
  });

  it("rams a target ahead, and does not hit the same target again within 10 ticks", () => {
    const sim = new Sim();
    sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: FORWARD }];
    sim.targets = [
      { id: "cow", offset: { x: 0, y: 0, z: 1.5 }, protectedOccupant: false },
    ];
    sim.run(Vehicle.create("car", 0), 40);
    expect(sim.hits.length).toBeGreaterThan(0);
    expect(sim.hits.length).toBeLessThanOrEqual(4);
  });

  it("an empty vehicle breaks after 3 hits, but not while occupied", () => {
    const empty = Vehicle.create("a", 0);
    new Sim().run(empty, 1);
    expect(
      [empty.receiveHit(1), empty.receiveHit(2), empty.receiveHit(3)].map(
        (e) => e.length,
      ),
    ).toEqual([0, 0, 1]);

    const sim = new Sim();
    sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: IDLE }];
    const occupied = Vehicle.create("b", 0);
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
          const v = Vehicle.rebuild("car", yaw, riders);
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
    const v = Vehicle.rebuild("v", 0, [driver, passenger]);
    expect(v.flipHeadlightSwitch("p", 0)).toBe(false);
    expect(v.flipHeadlightSwitch("outsider", 0)).toBe(false);
    expect(v.flipHeadlightSwitch("d", 0)).toBe(true);
  });

  it("does not flip for anyone when nobody drives", () => {
    expect(Vehicle.create("v", 0).flipHeadlightSwitch("d", 0)).toBe(false);
  });

  it("flips only on a use that follows a cooldown of idle switch", () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(fc.integer({ min: 0, max: 200 }))
          .map((t) => t.sort((a, b) => a - b)),
        (ticks) => {
          const v = Vehicle.rebuild("v", 0, [driver]);
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
