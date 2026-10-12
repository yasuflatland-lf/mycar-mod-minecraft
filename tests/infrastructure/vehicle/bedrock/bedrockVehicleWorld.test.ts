import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineCommand } from "../../../../src/domain/vehicle/drive";
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
  BlockPermutation: {
    resolve: (typeId: string, states: Record<string, number>) => ({
      typeId,
      states,
    }),
  },
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
    playSound: vi.fn(),
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
    teleport: vi.fn(),
    clearVelocity: vi.fn(),
    applyImpulse: vi.fn(),
    setRotation: vi.fn(),
    remove: vi.fn(),
    triggerEvent: vi.fn(),
    playAnimation: vi.fn(),
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
      world.loadedVehicles();
      expect(dimension.getBlock).not.toHaveBeenCalled();
      for (const y of [0, 1, 2, -0.3])
        expect(world.waterAt("car", { x: 0, y, z: 0 })).toBe(true);
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
      world.loadedVehicles();
      for (const y of [0, -0.3])
        expect(world.waterAt("car", { x: 0, y, z: 0 })).toBe(false);
    },
  );

  it("stops at an unloaded cell without dropping the snapshot", () => {
    const { dimension, world } = fixture();
    dimension.getBlock.mockReturnValueOnce({ typeId: "minecraft:water" });
    dimension.getBlock.mockImplementation(() => {
      throw new Error("unloaded");
    });
    const snap = world.loadedVehicles()[0];
    expect(snap?.id).toBe("car");
    expect(world.waterAt("car", { x: 0, y: 0, z: 0 })).toBe(true);
    expect(world.waterAt("car", { x: 0, y: 1, z: 0 })).toBe(false);
    expect(world.waterAt("car", { x: 0, y: -0.3, z: 0 })).toBe(false);
  });

  it("returns false for a missing entity", () => {
    const { world } = fixture();
    expect(world.waterAt("missing", { x: 1, y: 2, z: 3 })).toBe(false);
  });

  it("applies all offset axes before flooring the water cell", () => {
    const { world, dimension } = fixture();
    world.waterAt("car", { x: 2.5, y: -0.5, z: -4 });
    expect(dimension.getBlock).toHaveBeenCalledWith({ x: 1, y: 63, z: -2 });
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

  it("snapshots the vehicles of every dimension, not only the first one that has any", () => {
    fc.assert(
      fc.property(fc.subarray(["overworld", "nether", "the_end"]), (dimIds) => {
        const { car, world } = fixture();
        const cars = new Map(
          dimIds.map((dimId) => [dimId, { ...car, id: `car-${dimId}` }]),
        );
        game.getDimension.mockImplementation((id: string) => {
          const inDim = cars.get(id);
          return { getEntities: () => (inDim ? [inDim] : []) };
        });
        const ids = dimIds.map((dimId) => `car-${dimId}`);
        expect(world.loadedVehicles().map((s) => s.id)).toEqual(ids);
        expect(world.loadedVehicleIds()).toEqual(ids);
      }),
    );
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

describe("BedrockVehicleWorld command interpreter", () => {
  beforeEach(() => vi.resetAllMocks());

  it("runs all four commands in order at the vehicle", () => {
    const { world, car, dimension } = fixture();
    world.run(car.id, [
      { type: "setProperty", name: "bank", value: 12 },
      { type: "triggerEvent", name: "gravity_off" },
      { type: "playAnimation", name: "door_fr" },
      { type: "playSound", name: "random.door_open" },
    ]);
    expect(car.setProperty.mock.calls).toEqual([[`${NAMESPACE}:bank`, 12]]);
    expect(car.triggerEvent.mock.calls).toEqual([[`${NAMESPACE}:gravity_off`]]);
    expect(car.playAnimation.mock.calls).toEqual([
      [`animation.${NAMESPACE}.suv.door_fr`],
    ]);
    expect(dimension.playSound.mock.calls).toEqual([
      ["random.door_open", car.location],
    ]);
    const order = [
      car.setProperty,
      car.triggerEvent,
      car.playAnimation,
      dimension.playSound,
    ].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it("ignores every command when the entity is missing", () => {
    const { world, car, dimension } = fixture();
    world.run("missing", [
      { type: "setProperty", name: "bank", value: 0 },
      { type: "triggerEvent", name: "gravity_on" },
      { type: "playAnimation", name: "door_fl" },
      { type: "playSound", name: "random.door_open" },
    ]);
    for (const fn of [
      car.setProperty,
      car.triggerEvent,
      car.playAnimation,
      dimension.playSound,
    ])
      expect(fn).not.toHaveBeenCalled();
  });

  it("propagates a throw and stops the remaining commands", () => {
    const { world, car, dimension } = fixture();
    const failure = new Error("event failed");
    car.triggerEvent.mockImplementation(() => {
      throw failure;
    });
    expect(() =>
      world.run(car.id, [
        { type: "setProperty", name: "bank", value: 0 },
        { type: "triggerEvent", name: "gravity_off" },
        { type: "setProperty", name: "form", value: "hover" },
        { type: "playAnimation", name: "door_fr" },
        { type: "playSound", name: "random.door_open" },
      ]),
    ).toThrow(failure);
    expect(car.setProperty.mock.calls).toEqual([[`${NAMESPACE}:bank`, 0]]);
    expect(car.playAnimation).not.toHaveBeenCalled();
    expect(dimension.playSound).not.toHaveBeenCalled();
  });

  // The type checker rejects a missing case, so only a command cast past the
  // type reaches the default branch.
  it("throws on an unknown command type and stops the remaining commands", () => {
    const { world, car } = fixture();
    const unknown = { type: "spawnParticle", name: "smoke" };
    expect(() =>
      world.run(car.id, [
        { type: "setProperty", name: "bank", value: 0 },
        unknown as unknown as EngineCommand,
        { type: "triggerEvent", name: "gravity_off" },
      ]),
    ).toThrow(`Unknown engine command: ${JSON.stringify(unknown)}`);
    expect(car.setProperty.mock.calls).toEqual([[`${NAMESPACE}:bank`, 0]]);
    expect(car.triggerEvent).not.toHaveBeenCalled();
  });
});

it.each(["suv", "sportsboat"] as const)(
  "reads only %s's declared restored properties, lazily",
  (kind) => {
    vi.resetAllMocks();
    const { world, car } = fixture();
    car.typeId = ENTITY_TYPE[kind];
    car.getProperty.mockImplementation((name) =>
      name === `${NAMESPACE}:form` ? "hover" : name === `${NAMESPACE}:docked`,
    );
    const snapshot = world.loadedVehicles()[0];
    expect(car.getProperty.mock.calls).toEqual([[HEADLIGHTS_PROPERTY]]);
    car.getProperty.mockClear();
    expect(snapshot?.restored()).toStrictEqual(
      kind === "suv" ? { form: "hover" } : { docked: true },
    );
    expect(car.getProperty.mock.calls).toEqual(
      kind === "suv" ? [[`${NAMESPACE}:form`]] : [[`${NAMESPACE}:docked`]],
    );
  },
);

describe("BedrockVehicleWorld holds (ADR 0063)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("teleports and clears velocity on every held tick, then releases motion", () => {
    const { world, car } = fixture();
    const pose = { x: 1, y: 64.5, z: -2, yaw: 30 };
    const impulse = { x: 0, y: 0, z: 1 };
    for (let tick = 0; tick < 3; tick++) {
      world.holdAt(car.id, pose);
      world.applyMotion(car.id, impulse, pose.yaw);
    }
    expect(car.teleport.mock.calls).toEqual(
      Array.from({ length: 3 }, () => [
        { x: pose.x, y: pose.y, z: pose.z },
        { rotation: { x: 0, y: pose.yaw } },
      ]),
    );
    expect(car.clearVelocity).toHaveBeenCalledTimes(3);
    expect(car.applyImpulse).not.toHaveBeenCalled();
    world.holdAt(car.id, undefined);
    world.applyMotion(car.id, impulse, pose.yaw);
    expect(car.applyImpulse).toHaveBeenCalledWith(impulse);
    expect(car.setRotation).toHaveBeenCalledWith({ x: 0, y: pose.yaw });
    world.holdAt("missing", pose);
    expect(car.teleport).toHaveBeenCalledTimes(3);
  });
});
