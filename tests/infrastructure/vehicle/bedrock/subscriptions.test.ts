import type {
  ItemUseAfterEvent,
  PlayerInteractWithBlockBeforeEvent,
} from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { ITEM_TYPE } from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { registerSubscriptions } from "../../../../src/infrastructure/vehicle/bedrock/subscriptions";
import { TestInputStore } from "../../../../src/infrastructure/vehicle/testInput/testInputStore";

const game = vi.hoisted(() => ({
  before:
    vi.fn<
      (handler: (ev: PlayerInteractWithBlockBeforeEvent) => void) => void
    >(),
  use: vi.fn<(handler: (ev: ItemUseAfterEvent) => void) => void>(),
  run: vi.fn<(callback: () => void) => void>(),
  currentTick: 10,
}));
vi.mock("@minecraft/server", () => {
  const signal = () => ({ subscribe: vi.fn() });
  return {
    Direction: { Up: "Up" },
    GameMode: { Creative: "Creative" },
    EntityInitializationCause: {},
    ScriptEventSource: {},
    Player: class {},
    system: {
      get currentTick() {
        return game.currentTick;
      },
      run: game.run,
      runInterval: vi.fn(),
      afterEvents: { scriptEventReceive: signal() },
    },
    world: {
      beforeEvents: {
        playerInteractWithBlock: { subscribe: game.before },
        playerInteractWithEntity: signal(),
      },
      afterEvents: {
        itemUse: { subscribe: game.use },
        entityLoad: signal(),
        entitySpawn: signal(),
        playerSpawn: signal(),
        entityHitEntity: signal(),
      },
    },
  };
});

function fixture(
  typeId = ITEM_TYPE.sportsboat,
  depth = 3,
  playerId = "player",
) {
  const dimension = {
    id: "overworld",
    getBlock: vi.fn(({ y }: { y: number }) => ({
      typeId: y > 5 && y <= 5 + depth ? "minecraft:water" : "minecraft:air",
      isWaterlogged: false,
    })),
  };
  const block = { dimension, location: { x: 2, y: 5, z: 3 } };
  const player = {
    id: playerId,
    selectedSlotIndex: 2,
    getRotation: () => ({ y: -90 }),
    getGameMode: () => "Survival",
    getBlockFromViewDirection: vi.fn(() => ({ block })),
  };
  const place = { execute: vi.fn() };
  registerSubscriptions(
    { place } as unknown as Parameters<typeof registerSubscriptions>[0],
    new TestInputStore(),
  );
  const before = game.before.mock.calls.at(-1)?.[0];
  const use = game.use.mock.calls.at(-1)?.[0];
  if (!before || !use) throw new Error("subscriptions missing");
  game.run.mockClear();
  const event = {
    isFirstEvent: true,
    itemStack: { typeId },
    blockFace: "Down",
    cancel: false,
    block,
    player,
  };
  return {
    event,
    player,
    place,
    dimension,
    interact: () =>
      before(event as unknown as PlayerInteractWithBlockBeforeEvent),
    use: () =>
      use({
        itemStack: { typeId },
        source: player,
      } as unknown as ItemUseAfterEvent),
    flush: () => {
      for (const [callback] of game.run.mock.calls) callback();
      game.run.mockClear();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  game.currentTick = 10;
});

it("places the boat from any face on the next tick at the water surface", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("Up", "Down", "North", "South", "East", "West"),
      fc.integer({ min: 0, max: 16 }),
      (face, depth) => {
        const f = fixture(ITEM_TYPE.sportsboat, depth);
        f.event.blockFace = face;
        f.interact();
        expect(f.event.cancel).toBe(true);
        expect(f.place.execute).not.toHaveBeenCalled();
        game.currentTick++;
        f.flush();
        expect(f.place.execute).toHaveBeenCalledExactlyOnceWith({
          kind: "sportsboat",
          playerId: "player",
          dimensionId: "overworld",
          blockLocation: { x: 2, y: 5 + depth, z: 3 },
          yaw: -90,
          creative: false,
          slot: 2,
        });
      },
    ),
  );
});

it("keeps SUV placement restricted to first events on the top face without climbing", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("Up", "Down", "North", "South", "East", "West"),
      fc.boolean(),
      (face, first) => {
        const f = fixture(ITEM_TYPE.suv);
        f.event.blockFace = face;
        f.event.isFirstEvent = first;
        f.interact();
        f.use();
        f.flush();
        expect(f.event.cancel).toBe(first && face === "Up");
        expect(f.place.execute).toHaveBeenCalledTimes(
          first && face === "Up" ? 1 : 0,
        );
        if (first && face === "Up")
          expect(f.place.execute.mock.calls[0]?.[0].blockLocation).toEqual({
            x: 2,
            y: 5,
            z: 3,
          });
        expect(f.player.getBlockFromViewDirection).not.toHaveBeenCalled();
      },
    ),
  );
});

it("uses the liquid-inclusive ray and deduplicates both event orders per player and tick", () => {
  fc.assert(
    fc.property(fc.boolean(), (beforeFirst) => {
      const f = fixture();
      if (beforeFirst) {
        f.interact();
        f.use();
      } else {
        f.use();
        f.interact();
      }
      f.use();
      f.flush();
      expect(f.place.execute).toHaveBeenCalledTimes(1);
      expect(f.place.execute.mock.calls[0]?.[0].blockLocation.y).toBe(8);
      expect(f.player.getBlockFromViewDirection).toHaveBeenCalledWith({
        includeLiquidBlocks: true,
        includePassableBlocks: true,
        maxDistance: 12,
      });
      f.player.id = "other";
      f.use();
      expect(f.place.execute).toHaveBeenCalledTimes(2);
      game.currentTick++;
      f.use();
      expect(f.place.execute).toHaveBeenCalledTimes(3);
    }),
  );
});

it("ignores a repeated boat interaction and a ray with no hit", () => {
  const f = fixture();
  f.event.isFirstEvent = false;
  f.interact();
  f.player.getBlockFromViewDirection.mockReturnValue(
    undefined as unknown as ReturnType<
      typeof f.player.getBlockFromViewDirection
    >,
  );
  f.use();
  f.flush();
  expect(f.event.cancel).toBe(false);
  expect(f.place.execute).not.toHaveBeenCalled();
});

it("limits deferred placement and itemUse to one placement on their execution tick", () => {
  fc.assert(
    fc.property(fc.boolean(), (flushFirst) => {
      const f = fixture();
      f.interact();
      game.currentTick++;
      if (flushFirst) {
        f.flush();
        f.use();
      } else {
        f.use();
        f.flush();
      }
      expect(f.place.execute).toHaveBeenCalledTimes(1);
    }),
  );
});
