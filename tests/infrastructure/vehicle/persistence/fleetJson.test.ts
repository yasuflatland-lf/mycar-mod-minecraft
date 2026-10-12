import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseFleetState } from "../../../../src/infrastructure/vehicle/persistence/fleetJson";

describe("parseFleetState (ADR 0038)", () => {
  it("reads back a stored fleet", () => {
    const state = { order: ["a", "b"], evicted: ["c"] };
    expect(parseFleetState(JSON.stringify(state))).toEqual(state);
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
});
