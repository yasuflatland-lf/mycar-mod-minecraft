import { describe, expect, it } from "vitest";
import { parseFleetState } from "../../src/infrastructure/persistence/fleetJson";

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
});
