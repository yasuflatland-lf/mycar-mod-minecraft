// Connects game events to the use cases.
import {
  type Block,
  type Dimension,
  Direction,
  type Entity,
  EntityInitializationCause,
  GameMode,
  Player,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import type { DriveVehicles } from "../../../application/vehicle/driveVehicles";
import type { GiveStarterVehicle } from "../../../application/vehicle/giveStarterVehicle";
import type { HitVehicle } from "../../../application/vehicle/hitVehicle";
import type { LimitVehicles } from "../../../application/vehicle/limitVehicles";
import type { PaintVehicle } from "../../../application/vehicle/paintVehicle";
import type {
  PlaceVehicle,
  PlaceVehicleCommand,
} from "../../../application/vehicle/placeVehicle";
import type { SwitchHeadlights } from "../../../application/vehicle/switchHeadlights";
import type { Vec3 } from "../../../domain/shared/vec";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import { profileOf } from "../../../domain/vehicle/kinds/index";
import {
  type BlockFace,
  placementCell,
} from "../../../domain/vehicle/placement";
import { NAMESPACE } from "../../shared/identifiers";
import { parseTestInputMessage } from "../testInput/testInputMessage";
import type { TestInputStore } from "../testInput/testInputStore";
import { standsOnDeck } from "./deck";
import { removeOrphanDeckSeat } from "./deckSeats";
import {
  fleetEntryOf,
  HEADLIGHT_SWITCH_TYPE,
  isVehicleEntity,
  kindOfItem,
  PAINT_BY_DYE,
  TEST_INPUT_EVENT,
} from "./identifiers";
import { isWaterAt } from "./water";

const BLOCK_FACE: Readonly<Record<Direction, BlockFace>> = {
  [Direction.Up]: "up",
  [Direction.Down]: "down",
  [Direction.North]: "north",
  [Direction.South]: "south",
  [Direction.East]: "east",
  [Direction.West]: "west",
};

// How far the itemUse ray looks for water, in blocks. It reaches open water a
// little past the block interaction; a land hit never places (see itemUse below).
const WATER_RAY_DISTANCE = 12;

export function registerSubscriptions(
  useCases: {
    drive: DriveVehicles;
    place: PlaceVehicle;
    starter: GiveStarterVehicle;
    hit: HitVehicle;
    limit: LimitVehicles;
    paint: PaintVehicle;
    headlights: SwitchHeadlights;
  },
  testInputs: TestInputStore,
): void {
  system.runInterval(() => useCases.drive.execute(system.currentTick), 1);
  // The fleet never sees a vehicle spawn while the script is not running, so it
  // reads back the loaded ones once on start. After that only events add
  // vehicles: a scan would take a vehicle summoned this tick, whose spawn event
  // has not arrived yet, for one that was already there (ADR 0038). A vehicle
  // that is no longer valid was removed by an earlier event for the same load.
  system.run(() => useCases.limit.start());
  world.afterEvents.entityLoad.subscribe((ev) => {
    removeOrphanDeckSeat(ev.entity);
    if (!ev.entity.isValid) return;
    const entry = fleetEntryOf(ev.entity);
    if (entry) useCases.limit.found([entry]);
  });
  world.afterEvents.entitySpawn.subscribe((ev) => {
    if (ev.cause === EntityInitializationCause.Loaded)
      removeOrphanDeckSeat(ev.entity);
    if (!ev.entity.isValid) return;
    const entry = fleetEntryOf(ev.entity);
    if (!entry) return;
    if (ev.cause === EntityInitializationCause.Loaded) {
      useCases.limit.found([entry]);
    } else {
      useCases.limit.spawned(entry);
    }
  });

  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_INPUT_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const parsed = parseTestInputMessage(ev.message);
      if (!parsed) {
        console.warn(`[${NAMESPACE}] ignored test input: ${ev.message}`);
        return;
      }
      if (parsed.input !== undefined) {
        testInputs.set(parsed.vehicleId, parsed.input);
      } else {
        testInputs.clear(parsed.vehicleId);
      }
    },
    { namespaces: [NAMESPACE] },
  );

  // One tap on water can fire both the block interaction and itemUse, in the
  // same tick, so each player gets one placement request and one placement per
  // tick. The deferred placement runs a tick later, where it can meet an itemUse.
  const requested = oncePerPlayerPerTick();
  const placed = oncePerPlayerPerTick();
  const place = (cmd: PlaceVehicleCommand) => {
    if (placed(cmd.playerId)) useCases.place.execute(cmd);
  };
  const placeCommand = (
    player: Player,
    kind: VehicleKind,
    dimension: Dimension,
    blockLocation: Vec3,
  ): PlaceVehicleCommand => ({
    kind,
    playerId: player.id,
    dimensionId: dimension.id,
    blockLocation,
    yaw: player.getRotation().y,
    creative: player.getGameMode() === GameMode.Creative,
    slot: player.selectedSlotIndex,
  });
  // The interaction ray skips liquids and reports the bed under the water or
  // the shore beside it, so a water kind climbs to the top water cell of the
  // clicked or the adjacent cell (docs/spike-sportsboat.md).
  const cellFor = (kind: VehicleKind, block: Block, face: Direction) =>
    placementCell(
      profileOf(kind).placement,
      block.location,
      BLOCK_FACE[face],
      (at) => isWaterAt(block.dimension, at),
    );

  // The after-event only fires when the interaction did something, and an item
  // with no use behavior does nothing on a block, so a tap never reaches it
  // (BDS 1.26.52, mobile; ADR 0024). Before-events cannot change the world, so the
  // placement runs on the next tick. Cancelling keeps the tap from also opening
  // or toggling the block underneath.
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const kind = kindOfItem(ev.itemStack?.typeId);
    if (!ev.isFirstEvent || kind === undefined) return;
    const cell = cellFor(kind, ev.block, ev.blockFace);
    if (cell === undefined) return;
    ev.cancel = true;
    if (!requested(ev.player.id)) return;
    const cmd = placeCommand(ev.player, kind, ev.block.dimension, cell);
    system.run(() => place(cmd));
  });

  // initialSpawn is true on every join, not only the first one, so a player
  // dynamic property records who already received the item (ADR 0023).
  world.afterEvents.playerSpawn.subscribe((ev) => {
    if (ev.initialSpawn) useCases.starter.execute(ev.player.id);
  });

  // Painting listens to hits, not interactions: on touch a short tap on an
  // entity is an attack, and the interaction is left to getting in (ADR 0036).
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    const player = ev.damagingEntity;
    if (!isVehicleEntity(ev.hitEntity.typeId) || !(player instanceof Player))
      return;
    const held = player
      .getComponent("minecraft:inventory")
      ?.container?.getItem(player.selectedSlotIndex);
    const paint = PAINT_BY_DYE[held?.typeId ?? ""];
    if (paint) {
      useCases.paint.execute({
        playerId: player.id,
        vehicleId: ev.hitEntity.id,
        paint,
        creative: player.getGameMode() === GameMode.Creative,
        tick: system.currentTick,
      });
      return;
    }
    useCases.hit.execute({
      vehicleId: ev.hitEntity.id,
      tick: system.currentTick,
      fromDeck: standsOnDeck(player),
    });
  });

  const ridden = (player: Entity) => {
    const mount = player.getComponent("minecraft:riding")?.entityRidingOn;
    return isVehicleEntity(mount?.typeId) ? mount : undefined;
  };
  const switchHeadlights = (playerId: string, vehicleId: string) =>
    useCases.headlights.execute({
      playerId,
      vehicleId,
      tick: system.currentTick,
    });

  // A tap on open water past the interaction reach fires only itemUse. This ray
  // sees liquids, but only a water hit places a vehicle: land placement goes
  // through the block interaction above, which keeps the normal reach.
  world.afterEvents.itemUse.subscribe((ev) => {
    const kind = kindOfItem(ev.itemStack.typeId);
    if (
      kind !== undefined &&
      profileOf(kind).placement.surfaces.includes("water")
    ) {
      const player = ev.source;
      const hit = player.getBlockFromViewDirection({
        includeLiquidBlocks: true,
        includePassableBlocks: true,
        maxDistance: WATER_RAY_DISTANCE,
      });
      if (!hit || !isWaterAt(hit.block.dimension, hit.block.location)) return;
      const cell = cellFor(kind, hit.block, hit.face);
      if (cell && requested(player.id))
        place(placeCommand(player, kind, hit.block.dimension, cell));
      return;
    }
    if (ev.itemStack.typeId !== HEADLIGHT_SWITCH_TYPE) return;
    const car = ridden(ev.source);
    if (car) switchHeadlights(ev.source.id, car.id);
  });

  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (!isVehicleEntity(ev.target.typeId)) return;
    // A rider aiming at their own vehicle interacts with it instead of using
    // the item, so the switch is handled here too.
    if (
      ev.itemStack?.typeId === HEADLIGHT_SWITCH_TYPE &&
      ridden(ev.player)?.id === ev.target.id
    ) {
      ev.cancel = true;
      const playerId = ev.player.id;
      const vehicleId = ev.target.id;
      system.run(() => switchHeadlights(playerId, vehicleId));
    }
  });
}

/** Returns true for the first call per player in a game tick. */
function oncePerPlayerPerTick(): (playerId: string) => boolean {
  const seen = new Set<string>();
  let tick = -1;
  return (playerId) => {
    if (tick !== system.currentTick) {
      seen.clear();
      tick = system.currentTick;
    }
    if (seen.has(playerId)) return false;
    seen.add(playerId);
    return true;
  };
}
