import { beforeEach, describe, expect, it, vi } from "vitest";
import { SPEC } from "../../src/domain/vehicle/spec";
import { BedrockVehicleWorld } from "../../src/infrastructure/bedrock/bedrockVehicleWorld";
import { TestInputStore } from "../../src/infrastructure/testInput/testInputStore";

const game = vi.hoisted(() => ({
  getDimension: vi.fn(),
  getEntity: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: game,
  ButtonState: {},
  InputButton: {},
  EntityDamageCause: {},
  ItemStack: class {},
}));

function fixture() {
  const dimension = { getBlock: vi.fn(), getEntities: vi.fn() };
  const car = {
    id: "car",
    isValid: true,
    location: { x: -1.25, y: 64.25, z: 2.75 },
    dimension,
    isOnGround: false,
    getVelocity: () => ({ x: 0, y: 0, z: 0 }),
    getRotation: () => ({ y: 0 }),
    getProperty: () => "car",
    getComponent: () => undefined,
    triggerEvent: vi.fn(),
    setProperty: vi.fn(),
  };
  dimension.getEntities.mockReturnValue([car]);
  game.getDimension.mockImplementation((id: string) =>
    id === "overworld" ? dimension : { getEntities: () => [] },
  );
  game.getEntity.mockImplementation((id: string) =>
    id === car.id ? car : undefined,
  );
  return {
    dimension,
    car,
    world: new BedrockVehicleWorld(new TestInputStore()),
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
      expect(world.loadedVehicles()[0]?.waterDepth).toBe(SPEC.carHeight + 1);
      expect(dimension.getBlock.mock.calls.map(([at]) => at)).toEqual([
        { x: -2, y: 64, z: 2 },
        { x: -2, y: 65, z: 2 },
        { x: -2, y: 66, z: 2 },
      ]);
    },
  );

  it.each([undefined, { typeId: "minecraft:lava", isWaterlogged: false }])(
    "treats undefined blocks and lava as dry",
    (block) => {
      const { dimension, world } = fixture();
      dimension.getBlock.mockReturnValue(block);
      expect(world.loadedVehicles()[0]?.waterDepth).toBe(0);
    },
  );

  it("stops at an unloaded cell without dropping the snapshot", () => {
    const { dimension, world } = fixture();
    dimension.getBlock.mockReturnValueOnce({ typeId: "minecraft:water" });
    dimension.getBlock.mockImplementation(() => {
      throw new Error("unloaded");
    });
    expect(world.loadedVehicles()[0]?.waterDepth).toBe(0.75);
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
    expect(car.triggerEvent).toHaveBeenCalledWith("mycar:gravity_off");
    expect(car.setProperty).toHaveBeenCalledWith("mycar:form", "submarine");
    expect(car.triggerEvent.mock.invocationCallOrder[0]).toBeLessThan(
      car.setProperty.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
