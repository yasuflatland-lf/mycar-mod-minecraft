import { beforeEach, describe, expect, it, vi } from "vitest";
import { Fleet } from "../../../../src/domain/vehicle/fleet";
import { fleetLimitOf } from "../../../../src/domain/vehicle/kinds/index";
import { FLEET_PROPERTY } from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { DynamicPropertyFleetRepository } from "../../../../src/infrastructure/vehicle/persistence/dynamicPropertyFleetRepository";

const stored = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@minecraft/server", () => ({
  world: {
    getDynamicProperty: (key: string) => stored.get(key),
    setDynamicProperty: (key: string, value: unknown) => stored.set(key, value),
  },
}));

function repository() {
  const log = { warn: vi.fn<(message: string) => void>() };
  return { repo: new DynamicPropertyFleetRepository(log, fleetLimitOf), log };
}

beforeEach(() => stored.clear());

describe("DynamicPropertyFleetRepository (ADR 0038)", () => {
  it("loads an empty fleet when the world has no stored fleet", () => {
    const { repo, log } = repository();
    expect(repo.load().state()).toEqual({ order: [], evicted: [] });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("loads back the order and the evicted list it saved", () => {
    const { repo } = repository();
    const state = {
      order: [
        { id: "a", kind: "suv" as const, owner: "player" },
        { id: "b", kind: "sportsboat" as const },
      ],
      evicted: ["c"],
    };
    repo.save(Fleet.restore(state, fleetLimitOf));
    expect(stored.get(FLEET_PROPERTY)).toBe(
      JSON.stringify({ version: 2, ...state }),
    );
    expect(repo.load().state()).toEqual(state);
  });

  it("starts over with an empty fleet and warns when the stored fleet is malformed", () => {
    const { repo, log } = repository();
    stored.set(FLEET_PROPERTY, "{");
    expect(repo.load().state()).toEqual({ order: [], evicted: [] });
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.warn.mock.calls[0]?.[0]).toContain(FLEET_PROPERTY);
  });
});
