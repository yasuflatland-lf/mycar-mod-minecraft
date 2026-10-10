// Use case: place a vehicle by using the vehicle item on the top face of a block (ADR 0008).
import type { Vec3 } from "../domain/shared/vec";
import { canPlaceAt } from "../domain/vehicle/placement";
import { Vehicle } from "../domain/vehicle/vehicle";
import type { VehicleRepository } from "../domain/vehicle/vehicleRepository";
import type { PlacementWorld } from "./ports";

export interface PlaceVehicleCommand {
  playerId: string;
  dimensionId: string;
  /** Position of the block the item was used on (integer coordinates). The vehicle appears one block above it. */
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
    const block = cmd.blockLocation;
    const isAir = (dx: number, dy: number, dz: number) =>
      this.world.isAir(cmd.dimensionId, {
        x: block.x + dx,
        y: block.y + dy,
        z: block.z + dz,
      });
    // Returning before the spawn also leaves the item unconsumed.
    if (!canPlaceAt(isAir)) return false;
    const id = this.world.spawnVehicle(
      cmd.dimensionId,
      { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 },
      cmd.yaw,
    );
    this.repo.save(Vehicle.create(id, cmd.yaw));
    if (!cmd.creative) this.world.consumeVehicleItem(cmd.playerId);
    return true;
  }
}
