// tests/domain/vehicle.test.ts
import { describe, expect, it } from "vitest";
import { forward, leftOf, type Vec2 } from "../../src/domain/shared/vec";
import type { RawInput } from "../../src/domain/vehicle/driveInput";
import type { RamTarget } from "../../src/domain/vehicle/ram";
import { SEAT_POSITIONS } from "../../src/domain/vehicle/seats";
import { type RiderView, type TickContext, Vehicle } from "../../src/domain/vehicle/vehicle";
import { engineStep } from "../support/engineModel";

const FORWARD: RawInput = { moveX: 0, moveY: 1, jump: false };
const IDLE: RawInput = { moveX: 0, moveY: 0, jump: false };

function seatOffset(yaw: number, seat: number): Vec2 {
  const f = forward(yaw);
  const l = leftOf(f);
  const s = SEAT_POSITIONS[seat]!;
  return { x: l.x * s.x + f.x * s.z, z: l.z * s.x + f.z * s.z };
}

/** 車 1 台と、エンジンの簡易モデルによる世界。 */
class Sim {
  pos: Vec2 = { x: 0, z: 0 };
  vel: Vec2 = { x: 0, z: 0 };
  yaw = 0;
  riders: { id: string; seat: number; yaw: number; raw: RawInput }[] = [];
  testInput: RawInput | undefined;
  targets: RamTarget[] = [];
  hits: string[] = [];
  events: string[] = [];

  run(v: Vehicle, ticks: number, from = 0) {
    for (let t = from; t < from + ticks; t++) {
      const riders: RiderView[] = this.riders.map((r) => ({ id: r.id, offset: seatOffset(this.yaw, r.seat), yaw: r.yaw, raw: r.raw }));
      const ctx: TickContext = {
        tick: t,
        riders,
        testInput: this.testInput,
        velocity: this.vel,
        onGround: true,
        solidAt: () => false,
        targets: () => this.targets,
      };
      const out = v.tick(ctx);
      const r = engineStep({ pos: this.pos, vel: this.vel }, { x: out.impulse.x, z: out.impulse.z }, { mu: 0.688 });
      this.pos = r.body.pos;
      this.vel = r.body.vel;
      this.yaw = out.yaw;
      this.hits.push(...out.hits.map((h) => h.id));
      this.events.push(...out.events.map((e) => (e.type === "SeatVacated" ? `vacated:${e.seat}:${e.door}` : e.type)));
    }
  }
}

describe("Vehicle (集約)", () => {
  it("運転席の人がアクセルを踏むと前に進む", () => {
    const sim = new Sim();
    sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: FORWARD }];
    sim.run(Vehicle.create("car", 0), 40);
    expect(sim.pos.z).toBeGreaterThan(5);
  });

  it("助手席の人だけでは運転できない", () => {
    const sim = new Sim();
    sim.riders = [{ id: "p", seat: 1, yaw: 0, raw: FORWARD }];
    sim.run(Vehicle.create("car", 0), 40);
    expect(Math.hypot(sim.pos.x, sim.pos.z)).toBeLessThan(0.01);
  });

  it("停車中に乗り込むと、車の向きを運転者の視線に合わせる", () => {
    const sim = new Sim();
    sim.riders = [{ id: "d", seat: 0, yaw: 120, raw: IDLE }];
    const v = Vehicle.create("car", 0);
    sim.run(v, 1);
    expect(v.yaw).toBeCloseTo(120);
  });

  it("運転者が消える (切断など) と、運転席のドアのイベントを 1 回出し、車は惰性で止まる", () => {
    const sim = new Sim();
    const v = Vehicle.create("car", 0);
    sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: FORWARD }];
    sim.run(v, 40);
    sim.riders = [];
    sim.run(v, 200, 40);
    expect(sim.events).toEqual(["vacated:0:door_fr"]);
    expect(Math.hypot(sim.vel.x, sim.vel.z)).toBeLessThan(0.01);
  });

  it("運転者がいなければ、テスト用の入力で動く", () => {
    const sim = new Sim();
    sim.testInput = FORWARD;
    sim.run(Vehicle.create("car", 0), 40);
    expect(sim.pos.z).toBeGreaterThan(5);
  });

  it("前方の相手に当たる。同じ相手には 10 tick 以内に続けて当たらない", () => {
    const sim = new Sim();
    sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: FORWARD }];
    sim.targets = [{ id: "cow", offset: { x: 0, y: 0, z: 1.5 }, protectedOccupant: false }];
    sim.run(Vehicle.create("car", 0), 40);
    expect(sim.hits.length).toBeGreaterThan(0);
    expect(sim.hits.length).toBeLessThanOrEqual(4);
  });

  it("乗員のいない車は 3 回殴ると壊れ、乗員がいれば壊れない", () => {
    const empty = Vehicle.create("a", 0);
    new Sim().run(empty, 1);
    expect([empty.receiveHit(1), empty.receiveHit(2), empty.receiveHit(3)].map((e) => e.length)).toEqual([0, 0, 1]);

    const sim = new Sim();
    sim.riders = [{ id: "d", seat: 0, yaw: 0, raw: IDLE }];
    const occupied = Vehicle.create("b", 0);
    sim.run(occupied, 1);
    expect([1, 2, 3, 4].flatMap((t) => occupied.receiveHit(t))).toEqual([]);
  });
});
