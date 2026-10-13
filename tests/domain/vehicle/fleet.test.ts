import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Fleet, type FleetEntry } from "../../../src/domain/vehicle/fleet";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import { fleetLimitOf } from "../../../src/domain/vehicle/kinds/index";
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

describe("Fleet (ADR 0038, ADR 0066)", () => {
  it("evicts the oldest vehicle when the eleventh one arrives", () => {
    const fleet = Fleet.empty(fleetLimitOf);
    for (const id of ids(11)) fleet.admit(entry(id));
    expect(fleet.isEvicted("v0")).toBe(true);
    expect(fleet.has("v0")).toBe(false);
    expect(fleet.state().order).toEqual(entries(ids(11).slice(1)));
  });

  it("evicts a vehicle found later as the oldest at once when the fleet is full", () => {
    const fleet = Fleet.empty(fleetLimitOf);
    for (const id of ids(10)) fleet.admit(entry(id));
    fleet.admitAsOldest(entry("old"));
    expect(fleet.isEvicted("old")).toBe(true);
    expect(fleet.state().order).toEqual(entries(ids(10)));
  });

  it("frees a slot when a vehicle is forgotten", () => {
    const fleet = Fleet.empty(fleetLimitOf);
    for (const id of ids(10)) fleet.admit(entry(id));
    fleet.forget("v3");
    fleet.admit(entry("new"));
    expect(fleet.state().evicted).toEqual([]);
    expect(fleet.state().order).toHaveLength(SPEC.maxUnownedVehicles);
  });

  it("keeps at most the limit, evicts in arrival order, and bounds the evicted list", () => {
    fc.assert(
      fc.property(ops, (steps) => {
        const fleet = Fleet.empty(fleetLimitOf);
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
              while (model.length > SPEC.maxUnownedVehicles) {
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
          expect(state.order.length).toBeLessThanOrEqual(
            SPEC.maxUnownedVehicles,
          );
          expect(state.evicted.length).toBeLessThanOrEqual(SPEC.maxEvicted);
          expect(state.order).toEqual(entries(model));
          expect(state.evicted).toEqual(evicted);
        }
      }),
    );
  });

  it("keeps only the latest evictions once the evicted list is full", () => {
    const fleet = Fleet.empty(fleetLimitOf);
    const all = ids(SPEC.maxUnownedVehicles + SPEC.maxEvicted + 5);
    for (const id of all) fleet.admit(entry(id));
    expect(fleet.state().evicted).toEqual(all.slice(5, 5 + SPEC.maxEvicted));
  });

  it("restores any stored state with no repeated id and within the limits", () => {
    const idList = fc.array(
      fc.nat(SPEC.maxUnownedVehicles + SPEC.maxEvicted).map((n) => `v${n}`),
      { maxLength: 120 },
    );
    fc.assert(
      fc.property(idList, idList, (order, evicted) => {
        const state = Fleet.restore(
          { order: entries(order), evicted },
          fleetLimitOf,
        ).state();
        const all = [...state.order.map((entry) => entry.id), ...state.evicted];
        expect(new Set(all).size).toBe(all.length);
        expect(state.order.length).toBeLessThanOrEqual(SPEC.maxUnownedVehicles);
        expect(state.evicted.length).toBeLessThanOrEqual(SPEC.maxEvicted);
      }),
    );
  });

  it("round-trips through its state", () => {
    fc.assert(
      fc.property(ops, (steps) => {
        const fleet = Fleet.empty(fleetLimitOf);
        for (const { op, id } of steps) {
          if (op === "forget") fleet.forget(`v${id}`);
          else fleet[op](entry(`v${id}`));
        }
        expect(Fleet.restore(fleet.state(), fleetLimitOf).state()).toEqual(
          fleet.state(),
        );
      }),
    );
  });

  it("restores the stored evictions once each, without the vehicles it still tracks", () => {
    const fleet = Fleet.restore(
      {
        order: entries(["v0", "v1"]),
        evicted: ["old", "v1", "old", "older"],
      },
      fleetLimitOf,
    );
    expect(fleet.state()).toEqual({
      order: entries(["v0", "v1"]),
      evicted: ["old", "older"],
    });
    expect(fleet.isEvicted("old")).toBe(true);
    expect(fleet.isEvicted("v1")).toBe(false);
  });

  it("restores a state above the limit by evicting its oldest entries", () => {
    const fleet = Fleet.restore(
      { order: entries(ids(12)), evicted: [] },
      fleetLimitOf,
    );
    expect(fleet.state().order).toEqual(entries(ids(12).slice(2)));
    expect(fleet.state().evicted).toEqual(["v0", "v1"]);
  });

  it("matches a per-group model through random admissions, discoveries, and removals", () => {
    // Owners are drawn evenly, so "a:suv" with an SUV must stay apart from "a"
    // and from the unowned group. Sampling these arbitraries 2,000 times with
    // fc.sample and this model, every one of the nine groups overflowed in at
    // least 99.0% of runs and all nine in the same run in 94.2%. Comparing
    // serialized states and restoring every tenth step and at the end keeps
    // the test near 0.5 s with coverage, down from 8 s with toEqual and a
    // restoration every step. The cap on the evicted list has its own test.
    const steps = fc.array(
      fc.record({
        op: fc.constantFrom("admit", "admitAsOldest", "forget"),
        id: fc.nat(300).map((n) => `v${n}`),
        kind: fc.constantFrom(...VEHICLE_KINDS),
        owner: fc.constantFrom(undefined, "", "a", "b", "a:suv"),
      }),
      { minLength: 200, maxLength: 300 },
    );
    fc.assert(
      fc.property(
        fc.record({
          suv: fc.integer({ min: 1, max: 5 }),
          sportsboat: fc.integer({ min: 1, max: 5 }),
        }),
        steps,
        (limits, operations) => {
          const limitOf = (kind: FleetEntry["kind"]) => limits[kind];
          let fleet = Fleet.empty(limitOf);
          let order: FleetEntry[] = [];
          let evicted: string[] = [];
          const groupOf = (e: FleetEntry) =>
            e.owner === undefined ? "" : `${e.owner}\u0000${e.kind}`;
          const groupLimit = (e: FleetEntry) =>
            e.owner === undefined ? SPEC.maxUnownedVehicles : limits[e.kind];
          const expectModel = (actual: Fleet) => {
            const state = actual.state();
            if (JSON.stringify(state) !== JSON.stringify({ order, evicted })) {
              expect(state).toEqual({ order, evicted });
            }
          };
          operations.forEach(({ op, ...entry }, step) => {
            if (op === "forget") {
              fleet.forget(entry.id);
              order = order.filter((e) => e.id !== entry.id);
              evicted = evicted.filter((id) => id !== entry.id);
            } else {
              fleet[op](entry);
              if (
                !order.some((e) => e.id === entry.id) &&
                !evicted.includes(entry.id)
              ) {
                order = op === "admit" ? [...order, entry] : [entry, ...order];
                const peers = order.filter(
                  (e) => groupOf(e) === groupOf(entry),
                );
                const victims = new Set(
                  peers.slice(0, Math.max(0, peers.length - groupLimit(entry))),
                );
                order = order.filter((e) => !victims.has(e));
                evicted = [...evicted, ...[...victims].map((e) => e.id)].slice(
                  -SPEC.maxEvicted,
                );
              }
            }
            expectModel(fleet);
            const sizes = new Map<string, number>();
            for (const e of order) {
              const size = (sizes.get(groupOf(e)) ?? 0) + 1;
              sizes.set(groupOf(e), size);
              if (size > groupLimit(e))
                expect(size).toBeLessThanOrEqual(groupLimit(e));
            }
            if (step % 10 === 9 || step === operations.length - 1) {
              fleet = Fleet.restore(fleet.state(), limitOf);
              expectModel(fleet);
            }
          });
        },
      ),
    );
  });

  it("evicts an owner's first SUV when their eleventh SUV arrives", () => {
    const fleet = Fleet.empty(fleetLimitOf);
    for (const id of ids(11)) fleet.admit({ ...entry(id), owner: "a" });
    expect(fleet.state().evicted).toEqual(["v0"]);
    expect(fleet.state().order.map((e) => e.id)).toEqual(ids(11).slice(1));
  });

  it("evicts an owner's first boat without evicting their SUVs or another owner's vehicles", () => {
    const fleet = Fleet.empty(fleetLimitOf);
    const suvs = entries(ids(10)).map((e) => ({ ...e, owner: "a" }));
    const otherBoat = { id: "other", kind: "sportsboat" as const, owner: "b" };
    for (const e of suvs) fleet.admit(e);
    fleet.admit({ id: "first", kind: "sportsboat", owner: "a" });
    fleet.admit(otherBoat);
    fleet.admit({ id: "second", kind: "sportsboat", owner: "a" });
    expect(fleet.state().evicted).toEqual(["first"]);
    expect(fleet.state().order).toEqual([
      ...suvs,
      otherBoat,
      { id: "second", kind: "sportsboat", owner: "a" },
    ]);
    fleet.admit({ id: "other-suv", kind: "suv", owner: "b" });
    expect(fleet.state().evicted).toEqual(["first"]);
    expect(fleet.state().order.slice(0, suvs.length)).toEqual(suvs);
  });

  it("trims each group on restoration while sharing one unowned group across kinds", () => {
    const fleet = Fleet.restore(
      {
        order: [
          { id: "a-first", kind: "sportsboat", owner: "a" },
          ...entries(ids(10)),
          { id: "b-first", kind: "sportsboat", owner: "b" },
          { id: "unowned-boat", kind: "sportsboat" },
          { id: "a-second", kind: "sportsboat", owner: "a" },
          { id: "b-second", kind: "sportsboat", owner: "b" },
        ],
        evicted: ["previous"],
      },
      fleetLimitOf,
    );
    expect(fleet.state().evicted).toEqual([
      "previous",
      "a-first",
      "v0",
      "b-first",
    ]);
    expect(fleet.state().order.map((e) => e.id)).toEqual([
      ...ids(10).slice(1),
      "unowned-boat",
      "a-second",
      "b-second",
    ]);
  });

  it("keeps the first occurrence of each id even when later metadata differs", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (id, owner) => {
        const first = { id, kind: "sportsboat" as const, owner };
        const fleet = Fleet.restore(
          {
            order: [first, entry(id)],
            evicted: [id],
          },
          fleetLimitOf,
        );
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
        const restored = Fleet.restore(
          { order: [original], evicted: [] },
          fleetLimitOf,
        );
        const admitted = Fleet.empty(fleetLimitOf);
        admitted.admit(original);
        const found = Fleet.empty(fleetLimitOf);
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
