// Connects game events to the use cases.
import {
  Direction,
  type Entity,
  GameMode,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import type { DriveVehicles } from "../../application/driveVehicles";
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
  PLAYER_TYPE,
  TEST_INPUT_EVENT,
  VEHICLE_TYPE,
} from "./identifiers";

export function registerSubscriptions(
  useCases: {
    drive: DriveVehicles;
    place: PlaceVehicle;
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
  // (BDS 1.26.52, mobile; ADR 0023). Before-events cannot change the world, so the
  // placement runs on the next tick.
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (
      !ev.isFirstEvent ||
      ev.itemStack?.typeId !== ITEM_TYPE ||
      ev.blockFace !== Direction.Up
    )
      return;
    const cmd = {
      playerId: ev.player.id,
      dimensionId: ev.block.dimension.id,
      blockLocation: ev.block.location,
      yaw: ev.player.getRotation().y,
      creative: ev.player.getGameMode() === GameMode.Creative,
    };
    system.run(() => useCases.place.execute(cmd));
  });

  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (
      ev.hitEntity.typeId !== VEHICLE_TYPE ||
      ev.damagingEntity.typeId !== PLAYER_TYPE
    )
      return;
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
    const paint = PAINT_BY_DYE[ev.itemStack?.typeId ?? ""];
    if (!paint) return;
    // Cancelling keeps the player from getting in. Before-events cannot change
    // the world, so the repaint runs on the next tick.
    ev.cancel = true;
    const cmd = {
      playerId: ev.player.id,
      vehicleId: ev.target.id,
      paint,
      creative: ev.player.getGameMode() === GameMode.Creative,
    };
    system.run(() => useCases.paint.execute(cmd));
  });
}
