// Connects game events to the use cases.
import {
  Direction,
  type Entity,
  GameMode,
  Player,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import type { DriveVehicles } from "../../application/driveVehicles";
import type { GiveStarterVehicle } from "../../application/giveStarterVehicle";
import type { HitVehicle } from "../../application/hitVehicle";
import type { PaintVehicle } from "../../application/paintVehicle";
import type { PlaceVehicle } from "../../application/placeVehicle";
import type { SwitchHeadlights } from "../../application/switchHeadlights";
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
    paint: PaintVehicle;
    headlights: SwitchHeadlights;
  },
  testInputs: TestInputStore,
): void {
  system.runInterval(() => useCases.drive.execute(system.currentTick), 1);

  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_INPUT_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const parsed = parseTestInputMessage(ev.message);
      if (!parsed) {
        console.warn(`[mycar] ignored test input: ${ev.message}`);
        return;
      }
      if (parsed.input !== undefined) {
        testInputs.set(parsed.vehicleId, parsed.input);
      } else {
        testInputs.clear(parsed.vehicleId);
      }
    },
    { namespaces: ["mycar"] },
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

  const paintCommand = (player: Player, vehicle: Entity, itemType = "") => {
    const paint = PAINT_BY_DYE[itemType];
    if (!paint) return undefined;
    return {
      playerId: player.id,
      vehicleId: vehicle.id,
      paint,
      creative: player.getGameMode() === GameMode.Creative,
    };
  };

  world.afterEvents.entityHitEntity.subscribe((ev) => {
    const player = ev.damagingEntity;
    if (ev.hitEntity.typeId !== VEHICLE_TYPE || !(player instanceof Player))
      return;
    // On touch a short tap on an entity is an attack and only a long press
    // interacts, so a tap with a dye arrives here and paints instead of
    // counting toward breaking the vehicle (ADR 0036).
    const held = player
      .getComponent("minecraft:inventory")
      ?.container?.getItem(player.selectedSlotIndex);
    const cmd = paintCommand(player, ev.hitEntity, held?.typeId);
    if (cmd) {
      useCases.paint.execute(cmd);
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
      return;
    }
    const cmd = paintCommand(ev.player, ev.target, ev.itemStack?.typeId);
    if (!cmd) return;
    // Cancelling keeps the player from getting in. Before-events cannot change
    // the world, so the repaint runs on the next tick.
    ev.cancel = true;
    system.run(() => useCases.paint.execute(cmd));
  });
}
