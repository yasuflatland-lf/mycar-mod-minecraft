// Connects game events to the use cases.
import {
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
import type { PlaceVehicle } from "../../../application/vehicle/placeVehicle";
import type { SwitchHeadlights } from "../../../application/vehicle/switchHeadlights";
import { NAMESPACE } from "../../shared/identifiers";
import { parseTestInputMessage } from "../testInput/testInputMessage";
import type { TestInputStore } from "../testInput/testInputStore";
import {
  HEADLIGHT_SWITCH_TYPE,
  ITEM_TYPE,
  PAINT_BY_DYE,
  TEST_INPUT_EVENT,
  VEHICLE_TYPE,
} from "./identifiers";

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
    if (ev.entity.typeId === VEHICLE_TYPE && ev.entity.isValid)
      useCases.limit.found([ev.entity.id]);
  });
  world.afterEvents.entitySpawn.subscribe((ev) => {
    if (ev.entity.typeId !== VEHICLE_TYPE || !ev.entity.isValid) return;
    if (ev.cause === EntityInitializationCause.Loaded) {
      useCases.limit.found([ev.entity.id]);
    } else {
      useCases.limit.spawned(ev.entity.id);
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
        console.warn(`[yasuflatland] ignored test input: ${ev.message}`);
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

  // The after-event only fires when the interaction did something, and an item
  // with no use behavior does nothing on a block, so a tap never reaches it
  // (BDS 1.26.52, mobile; ADR 0024). Before-events cannot change the world, so the
  // placement runs on the next tick. Cancelling keeps the tap from also opening
  // or toggling the block underneath.
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (
      !ev.isFirstEvent ||
      ev.itemStack?.typeId !== ITEM_TYPE ||
      ev.blockFace !== Direction.Up
    )
      return;
    ev.cancel = true;
    const cmd = {
      playerId: ev.player.id,
      dimensionId: ev.block.dimension.id,
      blockLocation: ev.block.location,
      yaw: ev.player.getRotation().y,
      creative: ev.player.getGameMode() === GameMode.Creative,
      slot: ev.player.selectedSlotIndex,
    };
    system.run(() => useCases.place.execute(cmd));
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
    if (ev.hitEntity.typeId !== VEHICLE_TYPE || !(player instanceof Player))
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
    });
  });

  const ridden = (player: Entity) => {
    const mount = player.getComponent("minecraft:riding")?.entityRidingOn;
    return mount?.typeId === VEHICLE_TYPE ? mount : undefined;
  };
  const switchHeadlights = (playerId: string, vehicleId: string) =>
    useCases.headlights.execute({
      playerId,
      vehicleId,
      tick: system.currentTick,
    });

  world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack.typeId !== HEADLIGHT_SWITCH_TYPE) return;
    const car = ridden(ev.source);
    if (car) switchHeadlights(ev.source.id, car.id);
  });

  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (ev.target.typeId !== VEHICLE_TYPE) return;
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
