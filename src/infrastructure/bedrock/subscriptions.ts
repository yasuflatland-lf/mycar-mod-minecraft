// src/infrastructure/bedrock/subscriptions.ts
// ゲームのイベントをユースケースにつなぐ。
import { Direction, GameMode, system, world } from "@minecraft/server";
import type { DriveVehicles } from "../../application/driveVehicles";
import type { HitVehicle } from "../../application/hitVehicle";
import type { PlaceVehicle } from "../../application/placeVehicle";
import { ITEM_TYPE, VEHICLE_TYPE } from "./identifiers";

export function registerSubscriptions(useCases: {
  drive: DriveVehicles;
  place: PlaceVehicle;
  hit: HitVehicle;
}): void {
  system.runInterval(() => useCases.drive.execute(system.currentTick), 1);

  world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
    if (
      !ev.isFirstEvent ||
      ev.itemStack?.typeId !== ITEM_TYPE ||
      ev.blockFace !== Direction.Up
    )
      return;
    useCases.place.execute({
      playerId: ev.player.id,
      dimensionId: ev.block.dimension.id,
      blockLocation: ev.block.location,
      yaw: ev.player.getRotation().y,
      creative: ev.player.getGameMode() === GameMode.Creative,
    });
  });

  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (
      ev.hitEntity.typeId !== VEHICLE_TYPE ||
      ev.damagingEntity.typeId !== "minecraft:player"
    )
      return;
    useCases.hit.execute({
      vehicleId: ev.hitEntity.id,
      tick: system.currentTick,
    });
  });
}
