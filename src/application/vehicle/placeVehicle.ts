// Use case: place a vehicle from its item on the cell its kind's placement rule
// picks (ADR 0008, ADR 0050): the SUV on the top face of a block, the sports boat
// at the water surface from any face or the view ray, or on land from a top face (ADR 0051).
import type { Vec3 } from "../../domain/shared/vec";
import type { VehicleKind } from "../../domain/vehicle/kind";
import { createVehicle, profileOf } from "../../domain/vehicle/kinds/index";
import { canPlaceAt } from "../../domain/vehicle/placement";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { PlacementWorld } from "./ports";

export interface PlaceVehicleCommand {
  kind: VehicleKind;
  playerId: string;
  dimensionId: string;
  /**
   * Cell the vehicle sits on top of (integer coordinates): the block the item was
   * used on, or for a water kind the top water cell above or beside it (ADR 0051).
   * The vehicle appears one block above it.
   */
  blockLocation: Vec3;
  yaw: number;
  creative: boolean;
  /** Hotbar slot that held the item when it was used; the player may switch slots before the placement runs. */
  slot: number;
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
    if (!canPlaceAt(isAir, profileOf(cmd.kind).placement.clearance))
      return false;
    // Taking the item first means a player who moved or dropped it in the
    // meantime gets no vehicle, instead of a vehicle and the item (ADR 0024).
    if (
      !cmd.creative &&
      !this.world.consumeVehicleItem(cmd.playerId, cmd.slot, cmd.kind)
    )
      return false;
    const id = this.world.spawnVehicle(
      cmd.dimensionId,
      { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 },
      cmd.yaw,
      cmd.kind,
      cmd.playerId,
    );
    this.repo.save(createVehicle(cmd.kind, id, cmd.yaw));
    return true;
  }
}
