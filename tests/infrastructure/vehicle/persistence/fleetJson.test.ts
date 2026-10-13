import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import {
  parseFleetState,
  serializeFleetState,
} from "../../../../src/infrastructure/vehicle/persistence/fleetJson";

describe("parseFleetState (ADR 0038)", () => {
  it("drops the legacy order and keeps its evictions (ADR 0066)", () => {
    const state = { order: ["a", "b"], evicted: ["c"] };
    expect(parseFleetState(JSON.stringify(state))).toEqual({
      order: [],
      evicted: state.evicted,
    });
  });

  it.each([
    [42, /not a string/],
    ["{", /JSON/],
    ["null", /not an object/],
    ['{"order":["a"]}', /not a list of ids/],
    ['{"order":[1],"evicted":[]}', /not a list of ids/],
  ])("rejects %j", (raw, reason) => {
    expect(() => parseFleetState(raw)).toThrow(reason);
  });

  it("rejects any JSON primitive or null, naming that reason", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.boolean(), fc.string(), fc.constant(null)),
        (value) => {
          expect(() => parseFleetState(JSON.stringify(value))).toThrow(
            /not an object/,
          );
        },
      ),
    );
  });

  it("rejects order or evicted when any one entry is not an id", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string()),
        fc.array(fc.string()),
        fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
        fc.nat(),
        fc.boolean(),
        (ids, other, bad, at, inOrder) => {
          const broken: unknown[] = [...ids];
          broken.splice(at % (ids.length + 1), 0, bad);
          const state = inOrder
            ? { order: broken, evicted: other }
            : { order: other, evicted: broken };
          expect(() => parseFleetState(JSON.stringify(state))).toThrow(
            /not a list of ids/,
          );
        },
      ),
    );
  });
  it("round-trips every valid state with optional owners through version 2", () => {
    const entry = fc
      .record({
        id: fc.string(),
        kind: fc.constantFrom(...VEHICLE_KINDS),
        owner: fc.option(fc.string(), { nil: undefined }),
      })
      .map(({ id, kind, owner }) => ({
        id,
        kind,
        ...(owner === undefined ? {} : { owner }),
      }));
    fc.assert(
      fc.property(
        fc.record({ order: fc.array(entry), evicted: fc.array(fc.string()) }),
        (state) => {
          const raw = serializeFleetState(state);
          expect(JSON.parse(raw)).toEqual({ version: 2, ...state });
          expect(parseFleetState(raw)).toEqual(state);
        },
      ),
    );
  });

  it.each([
    [{ version: 3, order: [], evicted: [] }, /unsupported fleet version/],
    [{ version: null, order: [], evicted: [] }, /unsupported fleet version/],
    [{ version: 2, order: {}, evicted: [] }, /order is not a list/],
    [{ version: 2, order: [], evicted: [1] }, /evicted is not a list of ids/],
    [[], /not an object/],
  ])("rejects malformed or unsupported state %j", (value, reason) => {
    expect(() => parseFleetState(JSON.stringify(value))).toThrow(reason);
  });

  it("rejects malformed version 2 entries with a specific reason", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant([]),
        ),
        (id, bad) => {
          for (const [entry, reason] of [
            [bad, /order entry is not an object/],
            [{ id: bad, kind: "suv" }, /id is not a string/],
            [{ id, kind: "unknown" }, /kind is unknown/],
            [{ id, kind: "suv", owner: bad }, /owner is not a string/],
          ] as const) {
            expect(() =>
              parseFleetState(
                JSON.stringify({ version: 2, order: [entry], evicted: [] }),
              ),
            ).toThrow(reason);
          }
        },
      ),
    );
  });
});
