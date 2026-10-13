import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineCommand } from "../../../../src/domain/vehicle/drive";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import { SPEC } from "../../../../src/domain/vehicle/spec";
import { NAMESPACE } from "../../../../src/infrastructure/shared/identifiers";
import { BedrockVehicleWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockVehicleWorld";
import {
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  DECK_SEAT_OF_PROPERTY,
  DECK_SEAT_TYPE,
  DECK_SEATS_PROPERTY,
  ENTITY_TYPE,
  HEADLIGHTS_PROPERTY,
  ITEM_TYPE,
  OWNER_PROPERTY,
  PLAYER_TYPE,
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
    spawnEntity: vi.fn(),
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

describe("BedrockVehicleWorld placement (ADR 0066)", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(VEHICLE_KINDS)(
    "records the owner synchronously when spawning a %s",
    (kind) => {
      const { dimension, car, world } = fixture();
      dimension.spawnEntity.mockReturnValue(car);
      const ownerId = "placing-player";
      expect(
        world.spawnVehicle("overworld", car.location, 45, kind, ownerId),
      ).toBe(car.id);
      expect(dimension.spawnEntity).toHaveBeenCalledExactlyOnceWith(
        ENTITY_TYPE[kind],
        car.location,
      );
      expect(car.setRotation).toHaveBeenCalledExactlyOnceWith({ x: 0, y: 45 });
      expect(car.setDynamicProperty).toHaveBeenCalledExactlyOnceWith(
        OWNER_PROPERTY,
        ownerId,
      );
      expect(OWNER_PROPERTY).toBe("yasu_ride:owner");
    },
  );
});

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
          dimIds.map((dimId) => [
            dimId,
            {
              ...car,
              id: `car-${dimId}`,
              typeId: ENTITY_TYPE.sportsboat,
              getDynamicProperty: (key: string) =>
                key === OWNER_PROPERTY ? `owner-${dimId}` : undefined,
            },
          ]),
        );
        game.getDimension.mockImplementation((id: string) => {
          const inDim = cars.get(id);
          return { getEntities: () => (inDim ? [inDim] : []) };
        });
        const ids = dimIds.map((dimId) => `car-${dimId}`);
        expect(world.loadedVehicles().map((s) => s.id)).toEqual(ids);
        expect(world.loadedFleetEntries()).toEqual(
          dimIds.map((dimId) => ({
            id: `car-${dimId}`,
            kind: "sportsboat",
            owner: `owner-${dimId}`,
          })),
        );
      }),
    );
  });

  it("skips an unknown entity in the vehicle family in snapshots and fleet entries", () => {
    const { entities, car, world } = fixture();
    entities.push({ ...car, id: "unknown", typeId: "yasu_ride:unknown" });
    expect(
      world.loadedVehicles().map((s) => ({ id: s.id, kind: s.kind })),
    ).toEqual([{ id: car.id, kind: "suv" }]);
    expect(world.loadedFleetEntries()).toEqual([
      { id: car.id, kind: "suv", owner: undefined },
    ]);
  });

  it("drops the item of the broken entity's kind at its location", () => {
    const { car, dimension, world } = fixture();
    world.dropVehicleItem(car.id);
    expect(dimension.spawnItem).toHaveBeenCalledWith(
      expect.objectContaining({ typeId: ITEM_TYPE.suv, amount: 1 }),
      car.location,
    );
  });

  it("gives the item of the requested kind", () => {
    for (const kind of VEHICLE_KINDS) {
      const { world } = fixture();
      const playerId = "player";
      const addItem = vi.fn();
      const player = {
        id: playerId,
        typeId: PLAYER_TYPE,
        getComponent: (name: string) =>
          name === "minecraft:inventory"
            ? { container: { addItem } }
            : undefined,
      };
      game.getEntity.mockImplementation((id: string) =>
        id === playerId ? player : undefined,
      );

      world.giveVehicleItem(playerId, kind);

      expect(addItem).toHaveBeenCalledWith(
        expect.objectContaining({ typeId: ITEM_TYPE[kind], amount: 1 }),
      );
    }
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
        getButtonState: () => "Released",
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

it.each([
  { kind: "suv", name: "form", value: "hover" },
  { kind: "sportsboat", name: "docked", value: true },
] as const)(
  "reads only $kind's declared restored properties, lazily",
  ({ kind, name, value }) => {
    vi.resetAllMocks();
    const { world, car } = fixture();
    car.typeId = ENTITY_TYPE[kind];
    const stored: Record<string, unknown> = {
      [`${NAMESPACE}:form`]: "hover",
      [`${NAMESPACE}:docked`]: true,
    };
    car.getProperty.mockImplementation((key) => stored[key] ?? false);
    const snapshot = world.loadedVehicles()[0];
    expect(car.getProperty.mock.calls).toEqual([[HEADLIGHTS_PROPERTY]]);
    car.getProperty.mockClear();
    expect(snapshot?.restored()).toStrictEqual({ [name]: value });
    expect(car.getProperty.mock.calls).toEqual([[`${NAMESPACE}:${name}`]]);
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

  it("clears the floor and releases the hold of a removed vehicle", () => {
    const { dimension, world, car } = fixture();
    const grid = blockGrid();
    dimension.getBlock.mockImplementation(grid.getBlock);
    const cell = { x: 0, y: 64, z: 3, height: 9 };
    const pose = { x: 1, y: 64.5, z: -2, yaw: 30 };
    world.loadedVehicles();
    world.holdAt(car.id, pose);
    world.layFloor(car.id, [cell]);
    expect(grid.typeAt(cell)).toBe(DECK_FLOOR_BLOCK);
    world.removeVehicle(car.id);
    expect(grid.typeAt(cell)).toBe("minecraft:air");
    expect(car.setDynamicProperty).toHaveBeenLastCalledWith(
      DECK_CELLS_PROPERTY,
      undefined,
    );
    expect(car.remove).toHaveBeenCalledOnce();
    world.applyMotion(car.id, { x: 0, y: 0, z: 1 }, pose.yaw);
    expect(car.applyImpulse).toHaveBeenCalledOnce();
  });

  it("clears the floor and releases the hold of a vehicle that is no longer loaded (ADR 0038)", () => {
    const { dimension, world, car } = fixture();
    const grid = blockGrid();
    dimension.getBlock.mockImplementation(grid.getBlock);
    const cell = { x: 0, y: 64, z: 3, height: 9 };
    const pose = { x: 1, y: 64.5, z: -2, yaw: 30 };
    world.loadedVehicles();
    world.holdAt(car.id, pose);
    world.layFloor(car.id, [cell]);
    dimension.getEntities.mockReturnValue([]);
    world.loadedVehicles();
    expect(grid.typeAt(cell)).toBe("minecraft:air");
    dimension.getEntities.mockReturnValue([car]);
    world.loadedVehicles();
    world.applyMotion(car.id, { x: 0, y: 0, z: 1 }, pose.yaw);
    expect(car.applyImpulse).toHaveBeenCalledOnce();
  });
});

describe("BedrockVehicleWorld deck seats (ADR 0063)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the input of each deck seat rider and boards them onto the boat", () => {
    const { car, world } = fixture();
    const player = {
      id: "player",
      typeId: "minecraft:player",
      inputInfo: {
        getMovementVector: () => ({ x: 0.5, y: 1 }),
        getButtonState: () => "Released",
      },
    };
    const seatRiders: unknown[] = [player];
    const seatRideable = {
      getRiders: () => seatRiders,
      ejectRider: vi.fn(() => seatRiders.splice(0)),
      addRider: vi.fn(),
    };
    const seat = {
      id: "seat0",
      typeId: DECK_SEAT_TYPE,
      isValid: true,
      getDynamicProperty: (key: string) =>
        key === DECK_SEAT_OF_PROPERTY ? car.id : undefined,
      getComponent: () => seatRideable,
    };
    const boatRideable = { getRiders: () => [], addRider: vi.fn(() => true) };
    car.getDynamicProperty.mockImplementation((key: string) =>
      key === DECK_SEATS_PROPERTY
        ? JSON.stringify([seat.id, "empty"])
        : undefined,
    );
    car.getComponent.mockImplementation((name: string) =>
      name === "minecraft:rideable" ? boatRideable : undefined,
    );
    game.getEntity.mockImplementation((id: string) =>
      id === car.id ? car : id === seat.id ? seat : undefined,
    );
    expect(world.loadedVehicles()[0]?.deckSeatInputs).toEqual([
      { moveX: 0.5, moveY: 1, jump: false },
      undefined,
    ]);
    world.boardDeckRiders("missing");
    expect(boatRideable.addRider).not.toHaveBeenCalled();
    world.boardDeckRiders(car.id);
    expect(seatRideable.ejectRider).toHaveBeenCalledWith(player);
    expect(boatRideable.addRider).toHaveBeenCalledWith(player);
  });
});
