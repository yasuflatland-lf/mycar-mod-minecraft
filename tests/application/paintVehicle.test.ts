import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PaintVehicle } from "../../src/application/paintVehicle";
import { PAINTS } from "../../src/domain/vehicle/paint";
import { FakeWorld } from "./fakes";

const paint = fc.constantFrom(...PAINTS);

describe("PaintVehicle (ADR 0031)", () => {
  it("repaints to a different color, and consumes the dye only outside creative", () => {
    fc.assert(
      fc.property(paint, paint, fc.boolean(), (from, to, creative) => {
        fc.pre(from !== to);
        const world = new FakeWorld();
        world.paints.set("a", from);
        expect(
          new PaintVehicle(world).execute({
            playerId: "p",
            vehicleId: "a",
            paint: to,
            creative,
          }),
        ).toBe(true);
        expect(world.paints.get("a")).toBe(to);
        expect(world.calls).toEqual(
          creative ? [`paint:a:${to}`] : [`paint:a:${to}`, `dye:p:${to}`],
        );
      }),
    );
  });

  it("does nothing, and keeps the dye, when the vehicle already has that color", () => {
    fc.assert(
      fc.property(paint, (color) => {
        const world = new FakeWorld();
        world.paints.set("a", color);
        expect(
          new PaintVehicle(world).execute({
            playerId: "p",
            vehicleId: "a",
            paint: color,
            creative: false,
          }),
        ).toBe(false);
        expect(world.calls).toEqual([]);
      }),
    );
  });

  it("does nothing for a vehicle that no longer exists", () => {
    const world = new FakeWorld();
    expect(
      new PaintVehicle(world).execute({
        playerId: "p",
        vehicleId: "gone",
        paint: "red",
        creative: false,
      }),
    ).toBe(false);
    expect(world.calls).toEqual([]);
  });
});
