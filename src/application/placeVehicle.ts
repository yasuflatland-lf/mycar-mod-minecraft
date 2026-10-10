// src/application/placeVehicle.ts
// ユースケース: 車のアイテムをブロックの上面に使って車を出す (ADR 0008)。
import type { Vec3 } from "../domain/shared/vec";
import { canPlaceAt } from "../domain/vehicle/placement";
import { Vehicle } from "../domain/vehicle/vehicle";
import type { VehicleRepository } from "../domain/vehicle/vehicleRepository";
import type { PlacementWorld } from "./ports";

export interface PlaceVehicleCommand {
  playerId: string;
  dimensionId: string;
  /** アイテムを使ったブロックの位置 (整数座標)。車はこの 1 つ上に出る。 */
  blockLocation: Vec3;
  yaw: number;
  creative: boolean;
}

export class PlaceVehicle {
  constructor(
    private readonly world: PlacementWorld,
    private readonly repo: VehicleRepository,
  ) {}

  execute(cmd: PlaceVehicleCommand): boolean {
    const b = cmd.blockLocation;
    const isAir = (dx: number, dy: number, dz: number) =>
      this.world.isAir(cmd.dimensionId, {
        x: b.x + dx,
        y: b.y + dy,
        z: b.z + dz,
      });
    if (!canPlaceAt(isAir)) return false; // 車が入る空間がなければ出さず、アイテムも減らさない
    const id = this.world.spawnVehicle(
      cmd.dimensionId,
      { x: b.x + 0.5, y: b.y + 1, z: b.z + 0.5 },
      cmd.yaw,
    );
    this.repo.save(Vehicle.create(id, cmd.yaw));
    if (!cmd.creative) this.world.consumeVehicleItem(cmd.playerId);
    return true;
  }
}
