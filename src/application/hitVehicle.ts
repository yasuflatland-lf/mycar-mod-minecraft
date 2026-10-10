// Use case: a player hit a vehicle (ADR 0008).
import type { VehicleRepository } from "../domain/vehicle/vehicleRepository";
import type { BreakWorld } from "./ports";

export interface HitVehicleCommand {
  vehicleId: string;
  tick: number;
}

export class HitVehicle {
  constructor(
    private readonly world: BreakWorld,
    private readonly repo: VehicleRepository,
  ) {}

  execute(cmd: HitVehicleCommand): boolean {
    const vehicle = this.repo.get(cmd.vehicleId);
    if (!vehicle) return false;
    const broken = vehicle
      .receiveHit(cmd.tick)
      .some((e) => e.type === "VehicleBroken");
    if (!broken) return false;
    this.world.dropVehicleItem(cmd.vehicleId);
    this.world.removeVehicle(cmd.vehicleId);
    this.repo.remove(cmd.vehicleId);
    return true;
  }
}
