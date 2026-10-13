import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Fleet } from "../../../src/domain/vehicle/fleet";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import { SPEC } from "../../../src/domain/vehicle/spec";

const entry = (id: string) => ({ id, kind: "suv" as const });
const entries = (ids: string[]) => ids.map(entry);

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
    for (const id of ids(11)) fleet.admit(entry(id));
    expect(fleet.isEvicted("v0")).toBe(true);
    expect(fleet.has("v0")).toBe(false);
    expect(fleet.state().order).toEqual(entries(ids(11).slice(1)));
  });

  it("evicts a vehicle found later as the oldest at once when the fleet is full", () => {
    const fleet = Fleet.empty();
    for (const id of ids(10)) fleet.admit(entry(id));
    fleet.admitAsOldest(entry("old"));
    expect(fleet.isEvicted("old")).toBe(true);
    expect(fleet.state().order).toEqual(entries(ids(10)));
  });

  it("frees a slot when a vehicle is forgotten", () => {
    const fleet = Fleet.empty();
    for (const id of ids(10)) fleet.admit(entry(id));
    fleet.forget("v3");
    fleet.admit(entry("new"));
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
            fleet[op](entry(id));
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
          expect(state.order).toEqual(entries(model));
          expect(state.evicted).toEqual(evicted);
        }
      }),
    );
  });

  it("keeps only the latest evictions once the evicted list is full", () => {
    const fleet = Fleet.empty();
    const all = ids(SPEC.maxVehicles + SPEC.maxEvicted + 5);
    for (const id of all) fleet.admit(entry(id));
    expect(fleet.state().evicted).toEqual(all.slice(5, 5 + SPEC.maxEvicted));
  });

  it("restores any stored state with no repeated id and within the limits", () => {
    const idList = fc.array(
      fc.nat(SPEC.maxVehicles + SPEC.maxEvicted).map((n) => `v${n}`),
      { maxLength: 120 },
    );
    fc.assert(
      fc.property(idList, idList, (order, evicted) => {
        const state = Fleet.restore({ order: entries(order), evicted }).state();
        const all = [...state.order.map((entry) => entry.id), ...state.evicted];
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
        for (const { op, id } of steps) {
          if (op === "forget") fleet.forget(`v${id}`);
          else fleet[op](entry(`v${id}`));
        }
        expect(Fleet.restore(fleet.state()).state()).toEqual(fleet.state());
      }),
    );
  });

  it("restores the stored evictions once each, without the vehicles it still tracks", () => {
    const fleet = Fleet.restore({
      order: entries(["v0", "v1"]),
      evicted: ["old", "v1", "old", "older"],
    });
    expect(fleet.state()).toEqual({
      order: entries(["v0", "v1"]),
      evicted: ["old", "older"],
    });
    expect(fleet.isEvicted("old")).toBe(true);
    expect(fleet.isEvicted("v1")).toBe(false);
  });

  it("restores a state above the limit by evicting its oldest entries", () => {
    const fleet = Fleet.restore({ order: entries(ids(12)), evicted: [] });
    expect(fleet.state().order).toEqual(entries(ids(12).slice(2)));
    expect(fleet.state().evicted).toEqual(["v0", "v1"]);
  });
  it("preserves kind and owner while counting every entry against the world-wide limit", () => {
    const entryArb = fc.record({
      id: fc.string(),
      kind: fc.constantFrom(...VEHICLE_KINDS),
      owner: fc.option(fc.string(), { nil: undefined }),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(entryArb, {
          selector: (entry) => entry.id,
          maxLength: 100,
        }),
        (order) => {
          const fleet = Fleet.empty();
          for (const entry of order) fleet.admit(entry);
          const state = fleet.state();
          expect(state.order).toEqual(order.slice(-SPEC.maxVehicles));
          expect(state.evicted).toEqual(
            order
              .slice(0, Math.max(0, order.length - SPEC.maxVehicles))
              .map((entry) => entry.id)
              .slice(-SPEC.maxEvicted),
          );
          expect(Fleet.restore(state).state()).toEqual(state);
        },
      ),
    );
  });

  it("keeps the first occurrence of each id even when later metadata differs", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (id, owner) => {
        const first = { id, kind: "sportsboat" as const, owner };
        const fleet = Fleet.restore({
          order: [first, entry(id)],
          evicted: [id],
        });
        fleet.admit(entry(id));
        fleet.admitAsOldest(entry(id));
        expect(fleet.state()).toEqual({ order: [first], evicted: [] });
      }),
    );
  });

  it("copies entries on admission, restoration, and state reads", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (id, owner) => {
        const original = { id, kind: "suv" as const, owner };
        const expected = { ...original };
        const restored = Fleet.restore({ order: [original], evicted: [] });
        const admitted = Fleet.empty();
        admitted.admit(original);
        const found = Fleet.empty();
        found.admitAsOldest(original);
        original.owner += "changed";
        for (const fleet of [restored, admitted, found]) {
          const state = fleet.state();
          expect(state.order).toEqual([expected]);
          expect(state.order[0]).not.toBe(fleet.state().order[0]);
          expect(state.order).not.toBe(fleet.state().order);
          expect(state.evicted).not.toBe(fleet.state().evicted);
        }
      }),
    );
  });
});
