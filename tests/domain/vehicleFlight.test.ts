import { describe, expect, it } from "vitest";
import { forward, type Vec2 } from "../../src/domain/shared/vec";
import type { RawInput } from "../../src/domain/vehicle/driveInput";
import type { FlightMode } from "../../src/domain/vehicle/flight";
import { SPEC } from "../../src/domain/vehicle/spec";
import { Vehicle } from "../../src/domain/vehicle/vehicle";
import { AIR_DRAG, GRAVITY, VERTICAL_DRAG } from "../support/engineModel";

const GROUND_FRICTION = 0.688;
const IDLE: RawInput = { moveX: 0, moveY: 0, jump: false };
const FORWARD: RawInput = { moveX: 0, moveY: 1, jump: false, pitch: 0 };

/**
 * One vehicle driven by test input over flat ground at y = 0. Gravity follows
 * the flight mode the vehicle reports, as the mycar:hovering component group
 * does in game.
 */
class FlightSim {
  tick = 0;
  y = 0;
  vy = 0;
  vel: Vec2 = { x: 0, z: 0 };
  gravity: boolean;
  readonly changes: FlightMode[] = [];

  constructor(readonly vehicle: Vehicle = Vehicle.create("car", 0)) {
    this.gravity = vehicle.flightMode === "ground";
  }

  get onGround(): boolean {
    return this.y <= 0;
  }

  private horizontalDrag(): number {
    if (!this.gravity) return SPEC.flightDrag;
    return this.onGround ? GROUND_FRICTION : AIR_DRAG;
  }

  step(input: RawInput | undefined): void {
    const out = this.vehicle.tick({
      tick: this.tick++,
      riders: [],
      testInput: input,
      velocity: this.vel,
      velocityY: this.vy,
      onGround: this.onGround,
      solidAt: () => false,
      targets: () => [],
    });
    if (out.flight) {
      this.changes.push(out.flight);
      this.gravity = out.flight === "ground";
    }
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
  sim.run(IDLE, SPEC.takeoffTicks);
  expect(sim.vehicle.flightMode).toBe("flying");
  return sim;
}

describe("Vehicle in flight (ADR 0021)", () => {
  it("takes off on a double tap and rises about 1.5 blocks before flying", () => {
    const sim = new FlightSim();
    sim.doubleTap();
    sim.run(IDLE, SPEC.takeoffTicks + 5);
    expect(sim.changes).toEqual(["takeoff", "flying"]);
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
    sim.run(IDLE, SPEC.takeoffTicks);
    expect(sim.changes).toEqual(["takeoff", "flying"]);
  });

  it("holds altitude while cruising with a level view and reaches max speed", () => {
    const sim = flyingSim();
    const y0 = sim.y;
    sim.run(FORWARD, 100);
    expect(Math.abs(sim.y - y0)).toBeLessThan(1e-6);
    expect(Math.hypot(sim.vel.x, sim.vel.z)).toBeGreaterThan(
      SPEC.maxSpeed * 0.95,
    );
  });

  it("climbs when the driver looks up and sinks when they look down", () => {
    const sim = flyingSim();
    sim.run(FORWARD, 50);
    const y0 = sim.y;
    sim.run({ ...FORWARD, pitch: -30 }, 20);
    expect(sim.y).toBeGreaterThan(y0 + 3);
    const y1 = sim.y;
    sim.run({ ...FORWARD, pitch: 30 }, 10);
    expect(sim.y).toBeLessThan(y1 - 2);
  });

  it("lands on a second double tap and turns gravity back on when it touches down", () => {
    const sim = flyingSim();
    sim.doubleTap();
    expect(sim.changes.at(-1)).toBe("landing");
    sim.run(IDLE, 40);
    expect(sim.changes.slice(-2)).toEqual(["landing", "ground"]);
    expect(sim.y).toBe(0);
    expect(sim.gravity).toBe(true);
  });

  it("starts landing as soon as the input goes away mid-flight", () => {
    const sim = flyingSim();
    sim.step(undefined);
    expect(sim.changes.at(-1)).toBe("landing");
    sim.run(undefined, 40);
    expect(sim.vehicle.flightMode).toBe("ground");
  });

  it("keeps flying without reporting a change when rebuilt in flight", () => {
    const sim = new FlightSim(Vehicle.rebuild("car", 0, [], "flying"));
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
        velocity: { x: 0, z: 0 },
        velocityY: 0,
        onGround: false,
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
