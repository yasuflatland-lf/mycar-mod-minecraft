import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward, leftOf, type Vec2 } from "../../../src/domain/shared/vec";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import {
  nearestSeat,
  occupiedSeats,
  seatWorldPositions,
  toLocal,
  vacatedSeats,
} from "../../../src/domain/vehicle/seats";
import { defined } from "../../support/defined";

const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const seat = fc.integer({ min: 0, max: 3 });
const SEATS = SUV_PROFILE.seats.positions;

function worldOffset(yawDeg: number, i: number): Vec2 {
  const f = forward(yawDeg);
  const l = leftOf(f);
  const s = defined(SEATS[i], `seat ${i}`);
  return { x: l.x * s.x + f.x * s.z, z: l.z * s.x + f.z * s.z };
}

describe("seats (ADR 0019)", () => {
  it("seat 0 is front right (negative x = right, positive z = forward)", () => {
    expect(SEATS[0]).toEqual({ x: -0.38, z: 0.35 });
  });

  it("assigns an occupant at a seat position to that seat for any facing", () => {
    fc.assert(
      fc.property(yaw, seat, (y, i) => {
        expect(nearestSeat(toLocal(worldOffset(y, i), forward(y)), SEATS)).toBe(
          i,
        );
      }),
    );
  });

  it("assigns the occupant in the driver's seat to seat 0 regardless of getRiders order", () => {
    fc.assert(
      fc.property(
        yaw,
        fc.shuffledSubarray([0, 1, 2, 3], { minLength: 1 }),
        (y, seats) => {
          const riders = seats.map((i) => ({
            id: `p${i}`,
            offset: worldOffset(y, i),
          }));
          const map = occupiedSeats(riders, forward(y), SEATS);
          for (const i of seats) expect(map.get(`p${i}`)).toBe(i);
        },
      ),
    );
  });

  it("assigns seats using a supplied layout for any facing", () => {
    const positions = fc.uniqueArray(
      fc.record({
        x: fc.integer({ min: -10, max: 10 }),
        z: fc.integer({ min: -10, max: 10 }),
      }),
      { minLength: 1, maxLength: 8, selector: (p) => `${p.x},${p.z}` },
    );
    fc.assert(
      fc.property(positions, yaw, (layout, heading) => {
        const f = forward(heading);
        const left = leftOf(f);
        const riders = layout.map((position, i) => ({
          id: `r${i}`,
          offset: {
            x: left.x * position.x + f.x * position.z,
            z: left.z * position.x + f.z * position.z,
          },
        }));
        const seats = occupiedSeats(riders, f, layout);
        for (const [i, position] of layout.entries()) {
          expect(nearestSeat(position, layout)).toBe(i);
          expect(seats.get(`r${i}`)).toBe(i);
        }
      }),
    );
  });

  it("breaks an exact tie on the centerline toward the lower seat index, the driver's side", () => {
    fc.assert(
      fc.property(fc.double({ min: -3, max: 3, noNaN: true }), (z) => {
        expect([0, 2]).toContain(nearestSeat({ x: 0, z }, SEATS));
      }),
    );
    expect(nearestSeat({ x: 0, z: 0.35 }, SEATS)).toBe(0);
    expect(nearestSeat({ x: 0, z: -0.8 }, SEATS)).toBe(2);
  });

  it("returns the seats of occupants who left", () => {
    const prev = new Map([
      ["a", 0],
      ["b", 2],
    ]);
    expect(vacatedSeats(prev, new Map([["b", 2]]))).toEqual([0]);
    expect(vacatedSeats(prev, prev)).toEqual([]);
  });
});

it("recovers every local seat from its world position at any hold pose", () => {
  const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });
  fc.assert(
    fc.property(
      fc.record({ x: coordinate, y: coordinate, z: coordinate, yaw }),
      fc.array(fc.record({ x: coordinate, z: coordinate }), { maxLength: 8 }),
      (pose, positions) => {
        const world = seatWorldPositions(pose, positions);
        expect(world).toHaveLength(positions.length);
        for (const [index, point] of world.entries()) {
          const local = toLocal(
            { x: point.x - pose.x, z: point.z - pose.z },
            forward(pose.yaw),
          );
          expect(local.x).toBeCloseTo(defined(positions[index], "seat").x, 8);
          expect(local.z).toBeCloseTo(defined(positions[index], "seat").z, 8);
          expect(point.y).toBe(pose.y);
        }
      },
    ),
  );
});
