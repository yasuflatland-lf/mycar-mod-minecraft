import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FORMS } from "../../../../src/domain/vehicle/form";
import { SPEC } from "../../../../src/domain/vehicle/spec";
import { NAMESPACE } from "../../../../src/infrastructure/shared/identifiers";
import { BedrockVehicleWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockVehicleWorld";
import {
  ENTITY_TYPE,
  HEADLIGHTS_PROPERTY,
  ITEM_TYPE,
  VEHICLE_FAMILY,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { TestInputStore } from "../../../../src/infrastructure/vehicle/testInput/testInputStore";
import { blockGrid } from "../../../support/blockGrid";

const game = vi.hoisted(() => ({
  getDimension: vi.fn(),
  getEntity: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: game,
  ButtonState: {},
  InputButton: {},
  EntityDamageCause: {},
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
}));

function fixture() {
  const dimension = {
    getBlock: vi.fn(),
    getEntities: vi.fn(),
    spawnItem: vi.fn(),
  };
  const car = {
    id: "car",
    typeId: ENTITY_TYPE.suv,
    families: [VEHICLE_FAMILY],
    isValid: true,
    location: { x: -1.25, y: 64.25, z: 2.75 },
    dimension,
    isOnGround: false,
    getVelocity: () => ({ x: 0, y: 0, z: 0 }),
    getRotation: () => ({ y: 0 }),
    getProperty: vi.fn((_key: string): unknown => undefined),
    getComponent: vi.fn((_name: string): unknown => undefined),
    getDynamicProperty: vi.fn(),
    setDynamicProperty: vi.fn(),
    triggerEvent: vi.fn(),
    setProperty: vi.fn(),
  };
  const entities = [car];
  dimension.getEntities.mockImplementation(
    (query: { type?: string; families?: string[] } = {}) =>
      entities.filter(
        (e) =>
          (query.type === undefined || e.typeId === query.type) &&
          (query.families === undefined ||
            query.families.every((family) => e.families.includes(family))),
      ),
  );
  game.getDimension.mockImplementation((id: string) =>
    id === "overworld" ? dimension : { getEntities: () => [] },
  );
  game.getEntity.mockImplementation((id: string) =>
    id === car.id ? car : undefined,
  );
  const inputs = new TestInputStore();
  return {
    inputs,
    entities,
    dimension,
    car,
    world: new BedrockVehicleWorld(inputs),
  };
}

describe("BedrockVehicleWorld submarine wiring (ADR 0040)", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ["minecraft:water", false],
    ["minecraft:flowing_water", false],
    ["minecraft:bubble_column", false],
    ["minecraft:kelp", true],
    ["minecraft:seagrass", true],
  ])(
    "counts %s as water and probes at floored x/z",
    (typeId, isWaterlogged) => {
      const { dimension, world } = fixture();
      dimension.getBlock.mockReturnValue({ typeId, isWaterlogged });
      const snap = world.loadedVehicles()[0];
      expect(snap?.waterDepth).toBe(SPEC.carHeight + 1);
      expect(snap?.waterBelow).toBe(true);
      expect(dimension.getBlock.mock.calls.map(([at]) => at)).toEqual([
        { x: -2, y: 64, z: 2 },
        { x: -2, y: 65, z: 2 },
        { x: -2, y: 66, z: 2 },
        { x: -2, y: 63, z: 2 },
      ]);
    },
  );

  it.each([undefined, { typeId: "minecraft:lava", isWaterlogged: false }])(
    "treats undefined blocks and lava as dry",
    (block) => {
      const { dimension, world } = fixture();
      dimension.getBlock.mockReturnValue(block);
      const snap = world.loadedVehicles()[0];
      expect(snap?.waterDepth).toBe(0);
      expect(snap?.waterBelow).toBe(false);
    },
  );

  it("stops at an unloaded cell without dropping the snapshot", () => {
    const { dimension, world } = fixture();
    dimension.getBlock.mockReturnValueOnce({ typeId: "minecraft:water" });
    dimension.getBlock.mockImplementation(() => {
      throw new Error("unloaded");
    });
    const snap = world.loadedVehicles()[0];
    expect(snap?.waterDepth).toBe(0.75);
    expect(snap?.waterBelow).toBe(false);
  });

  it("reports water below feet less than 0.3 above a water cell, independently of waterDepth", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -60, max: 300 }),
        // Exactly 0.3 is left out: y + 0.3 - 0.3 rounds below y for some y.
        fc
          .oneof(
            fc.double({ min: 0, max: 0.999, noNaN: true }),
            fc.constantFrom(0, 0.299, 0.301, 0.999),
          )
          .filter((fraction) => Math.abs(fraction - 0.3) > 1e-9),
        (y, fraction) => {
          const { car, dimension, world } = fixture();
          car.location.y = y + fraction;
          dimension.getBlock.mockImplementation((at: { y: number }) => ({
            typeId: at.y === y - 1 ? "minecraft:water" : "minecraft:air",
            isWaterlogged: false,
          }));
          const snap = world.loadedVehicles()[0];
          expect(snap?.waterDepth).toBe(0);
          // Feet 0.3 or more above the water cell are airborne, not afloat.
          expect(snap?.waterBelow).toBe(fraction < 0.3);
        },
      ),
    );
  });

  it("refreshes breathing without particles and ignores a missing player", () => {
    const { world } = fixture();
    const addEffect = vi.fn();
    game.getEntity.mockImplementation((id: string) =>
      id === "rider" ? { typeId: "minecraft:player", addEffect } : undefined,
    );
    world.giveWaterBreathing("rider", SPEC.waterBreathingTicks);
    world.giveWaterBreathing("missing", SPEC.waterBreathingTicks);
    expect(addEffect.mock.calls).toEqual([
      ["water_breathing", SPEC.waterBreathingTicks, { showParticles: false }],
    ]);
  });

  it("switches gravity off for submarine and writes its form on the same call", () => {
    const { car, world } = fixture();
    world.setForm(car.id, "submarine");
    expect(car.triggerEvent).toHaveBeenCalledWith(`${NAMESPACE}:gravity_off`);
    expect(car.setProperty).toHaveBeenCalledWith(
      `${NAMESPACE}:form`,
      "submarine",
    );
    expect(car.triggerEvent.mock.invocationCallOrder[0]).toBeLessThan(
      car.setProperty.mock.invocationCallOrder[0] ?? 0,
    );
  });
});

describe("BedrockVehicleWorld snapshots", () => {
  const cow = {
    id: "cow",
    typeId: "minecraft:cow",
    location: { x: 0, y: 64, z: 0 },
    getVelocity: () => ({ x: 0, y: 0, z: 0 }),
    getRotation: () => ({ y: 0 }),
    getProperty: () => undefined,
    getComponent: () => undefined,
    inputInfo: {
      getMovementVector: () => ({ x: 0, y: 0 }),
      getButtonState: () => undefined,
    },
  };

  beforeEach(() => vi.resetAllMocks());

  it("snapshots only vehicles, not the other entities in the dimension", () => {
    const { entities, car, world } = fixture();
    entities.push({
      ...car,
      id: "cow",
      typeId: "minecraft:cow",
      families: ["cow"],
    });
    expect(world.loadedVehicles().map((s) => s.id)).toEqual(["car"]);
  });

  it("skips an unknown entity in the vehicle family in snapshots and fleet IDs", () => {
    const { entities, car, world } = fixture();
    entities.push({ ...car, id: "unknown", typeId: "yasu_ride:unknown" });
    expect(
      world.loadedVehicles().map((s) => ({ id: s.id, kind: s.kind })),
    ).toEqual([{ id: car.id, kind: "suv" }]);
    expect(world.loadedVehicleIds()).toEqual([car.id]);
  });

  it("drops the item of the broken entity's kind at its location", () => {
    const { car, dimension, world } = fixture();
    world.dropVehicleItem(car.id);
    expect(dimension.spawnItem).toHaveBeenCalledWith(
      expect.objectContaining({ typeId: ITEM_TYPE.suv, amount: 1 }),
      car.location,
    );
  });

  it("reports the headlights as the vehicle's headlights property says (ADR 0020)", () => {
    fc.assert(
      fc.property(fc.constantFrom(true, false, undefined, "true"), (value) => {
        const { car, world } = fixture();
        car.getProperty.mockImplementation((key) =>
          key === HEADLIGHTS_PROPERTY ? value : undefined,
        );
        expect(world.loadedVehicles()[0]?.headlights).toBe(value === true);
      }),
    );
  });

  it("counts only players in the seats as riders (ADR 0019)", () => {
    const { car, world } = fixture();
    const player = {
      id: "player",
      typeId: "minecraft:player",
      location: { x: 0, y: 64, z: 0 },
      getRotation: () => ({ y: 0 }),
      inputInfo: {
        getMovementVector: () => ({ x: 0, y: 1 }),
        getButtonState: () => undefined,
      },
    };
    car.getComponent.mockImplementation((name) =>
      name === "minecraft:rideable"
        ? { getRiders: () => [cow, player] }
        : undefined,
    );
    expect(world.loadedVehicles()[0]?.riders.map((r) => r.id)).toEqual([
      "player",
    ]);
  });

  it("forgets the test input of a vehicle once it is no longer loaded (ADR 0010)", () => {
    const { inputs, dimension, car, world } = fixture();
    const input = { moveX: 0, moveY: 1, jump: false };
    inputs.set(car.id, input);
    expect(world.loadedVehicles()[0]?.testInput).toEqual(input);
    expect(world.loadedVehicles()[0]?.testInput).toEqual(input);
    dimension.getEntities.mockReturnValue([]);
    world.loadedVehicles();
    dimension.getEntities.mockReturnValue([car]);
    expect(world.loadedVehicles()[0]?.testInput).toBeUndefined();
  });

  it("clears the headlight blocks of a vehicle once it is no longer loaded (ADR 0020, 0038)", () => {
    const { dimension, car, world } = fixture();
    const grid = blockGrid();
    dimension.getBlock.mockImplementation(grid.getBlock);
    const cell = { x: 0, y: 65, z: 4 };
    world.loadedVehicles();
    world.shineHeadlights(car.id, [cell]);
    world.loadedVehicles();
    expect(grid.typeAt(cell)).toBe("minecraft:light_block_15");
    dimension.getEntities.mockReturnValue([]);
    world.loadedVehicles();
    expect(grid.typeAt(cell)).toBe("minecraft:air");
  });
});

describe("BedrockVehicleWorld flight wiring", () => {
  beforeEach(() => vi.resetAllMocks());

  it("keeps gravity on only in the car form (ADR 0021, 0039)", () => {
    fc.assert(
      fc.property(fc.constantFrom(...FORMS), (form) => {
        const { car, world } = fixture();
        world.setForm(car.id, form);
        expect(car.triggerEvent.mock.calls).toEqual([
          [
            form === "car"
              ? `${NAMESPACE}:gravity_on`
              : `${NAMESPACE}:gravity_off`,
          ],
        ]);
      }),
    );
  });

  it("switches a rider to the third-person camera and back (ADR 0028)", () => {
    const { world } = fixture();
    const camera = { setCamera: vi.fn(), clear: vi.fn() };
    game.getEntity.mockImplementation((id: string) =>
      id === "rider" ? { typeId: "minecraft:player", camera } : undefined,
    );
    world.setThirdPerson("rider", true);
    expect(camera.setCamera.mock.calls).toEqual([["minecraft:third_person"]]);
    expect(camera.clear).not.toHaveBeenCalled();
    world.setThirdPerson("rider", false);
    expect(camera.clear).toHaveBeenCalledTimes(1);
    expect(camera.setCamera).toHaveBeenCalledTimes(1);
  });
});
