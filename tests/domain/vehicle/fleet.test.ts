import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Fleet } from "../../../src/domain/vehicle/fleet";
import { SPEC } from "../../../src/domain/vehicle/spec";

const ids = (n: number, prefix = "v") =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

const ops = fc.array(
  fc.oneof(
    fc.record({ op: fc.constant("admit" as const), id: fc.nat(40) }),
    fc.record({ op: fc.constant("admitAsOldest" as const), id: fc.nat(40) }),
    fc.record({ op: fc.constant("forget" as const), id: fc.nat(40) }),
  ),
  { maxLength: 200 },
);

describe("Fleet (ADR 0038)", () => {
  it("evicts the oldest vehicle when the eleventh one arrives", () => {
    const fleet = Fleet.empty();
    for (const id of ids(11)) fleet.admit(id);
    expect(fleet.isEvicted("v0")).toBe(true);
    expect(fleet.has("v0")).toBe(false);
    expect(fleet.state().order).toEqual(ids(11).slice(1));
  });

  it("evicts a vehicle found later as the oldest at once when the fleet is full", () => {
    const fleet = Fleet.empty();
    for (const id of ids(10)) fleet.admit(id);
    fleet.admitAsOldest("old");
    expect(fleet.isEvicted("old")).toBe(true);
    expect(fleet.state().order).toEqual(ids(10));
  });

  it("frees a slot when a vehicle is forgotten", () => {
    const fleet = Fleet.empty();
    for (const id of ids(10)) fleet.admit(id);
    fleet.forget("v3");
    fleet.admit("new");
    expect(fleet.state().evicted).toEqual([]);
    expect(fleet.state().order).toHaveLength(SPEC.maxVehicles);
  });

  it("keeps at most the limit, evicts in arrival order, and bounds the evicted list", () => {
    fc.assert(
      fc.property(ops, (steps) => {
        const fleet = Fleet.empty();
        // Model: tracked ids, oldest first, where a found vehicle goes to the front.
        let model: string[] = [];
        let evicted: string[] = [];
        for (const { op, id: n } of steps) {
          const id = `v${n}`;
          if (op === "admit" || op === "admitAsOldest") {
            fleet[op](id);
            if (!model.includes(id) && !evicted.includes(id)) {
              if (op === "admit") model.push(id);
              else model.unshift(id);
              while (model.length > SPEC.maxVehicles) {
                evicted.push(model.shift() as string);
              }
              evicted = evicted.slice(-SPEC.maxEvicted);
            }
          } else {
            fleet.forget(id);
            model = model.filter((m) => m !== id);
            evicted = evicted.filter((m) => m !== id);
          }
          const state = fleet.state();
          expect(state.order.length).toBeLessThanOrEqual(SPEC.maxVehicles);
          expect(state.evicted.length).toBeLessThanOrEqual(SPEC.maxEvicted);
          expect(state.order).toEqual(model);
          expect(state.evicted).toEqual(evicted);
        }
      }),
    );
  });

  it("keeps only the latest evictions once the evicted list is full", () => {
    const fleet = Fleet.empty();
    const all = ids(SPEC.maxVehicles + SPEC.maxEvicted + 5);
    for (const id of all) fleet.admit(id);
    expect(fleet.state().evicted).toEqual(all.slice(5, 5 + SPEC.maxEvicted));
  });

  it("restores any stored state with no repeated id and within the limits", () => {
    const idList = fc.array(
      fc.nat(SPEC.maxVehicles + SPEC.maxEvicted).map((n) => `v${n}`),
      { maxLength: 120 },
    );
    fc.assert(
      fc.property(idList, idList, (order, evicted) => {
        const state = Fleet.restore({ order, evicted }).state();
        const all = [...state.order, ...state.evicted];
        expect(new Set(all).size).toBe(all.length);
        expect(state.order.length).toBeLessThanOrEqual(SPEC.maxVehicles);
        expect(state.evicted.length).toBeLessThanOrEqual(SPEC.maxEvicted);
      }),
    );
  });

  it("round-trips through its state", () => {
    fc.assert(
      fc.property(ops, (steps) => {
        const fleet = Fleet.empty();
        for (const { op, id } of steps) fleet[op](`v${id}`);
        expect(Fleet.restore(fleet.state()).state()).toEqual(fleet.state());
      }),
    );
  });

  it("restores a state above the limit by evicting its oldest entries", () => {
    const fleet = Fleet.restore({ order: ids(12), evicted: [] });
    expect(fleet.state().order).toEqual(ids(12).slice(2));
    expect(fleet.state().evicted).toEqual(["v0", "v1"]);
  });
});
