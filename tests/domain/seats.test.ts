// tests/domain/seats.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward, leftOf } from "../../src/domain/shared/vec";
import { nearestSeat, occupiedSeats, SEAT_POSITIONS, toLocal, vacatedSeats } from "../../src/domain/vehicle/seats";

const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const seat = fc.integer({ min: 0, max: 3 });

function worldOffset(yawDeg: number, i: number) {
  const f = forward(yawDeg);
  const l = leftOf(f);
  const s = SEAT_POSITIONS[i]!;
  return { x: l.x * s.x + f.x * s.z, z: l.z * s.x + f.z * s.z };
}

describe("seats (ADR 0007)", () => {
  it("座席 0 は右前 (x が負 = 右、z が正 = 前)", () => {
    expect(SEAT_POSITIONS[0]).toEqual({ x: -0.38, z: 0.35 });
  });

  it("どの向きでも、座席の位置にいる乗員はその座席と判定される", () => {
    fc.assert(fc.property(yaw, seat, (y, i) => {
      expect(nearestSeat(toLocal(worldOffset(y, i), forward(y)))).toBe(i);
    }));
  });

  it("getRiders の順番に関係なく、運転席の人を座席 0 と判定する", () => {
    fc.assert(fc.property(yaw, fc.shuffledSubarray([0, 1, 2, 3], { minLength: 1 }), (y, seats) => {
      const riders = seats.map((i) => ({ id: `p${i}`, offset: worldOffset(y, i) }));
      const map = occupiedSeats(riders, forward(y));
      for (const i of seats) expect(map.get(`p${i}`)).toBe(i);
    }));
  });

  it("いなくなった乗員の座席を返す", () => {
    const prev = new Map([["a", 0], ["b", 2]]);
    expect(vacatedSeats(prev, new Map([["b", 2]]))).toEqual([0]);
    expect(vacatedSeats(prev, prev)).toEqual([]);
  });
});
