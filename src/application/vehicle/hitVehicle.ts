// Use case: a player hit a vehicle (ADR 0008).

import type { FleetRepository } from "../../domain/vehicle/fleetRepository";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { BreakWorld } from "./ports";

export interface HitVehicleCommand {
  vehicleId: string;
  tick: number;
  /** The attacker stands on a deck floor block (ADR 0063). */
  fromDeck: boolean;
}

export class HitVehicle {
  constructor(
    private readonly world: BreakWorld,
    private readonly repo: VehicleRepository,
    private readonly fleets: FleetRepository,
  ) {}

  execute(cmd: HitVehicleCommand): boolean {
    if (cmd.fromDeck) return false;
    const vehicle = this.repo.get(cmd.vehicleId);
    if (!vehicle) return false;
    const broken = vehicle
      .receiveHit(cmd.tick)
      .some((e) => e.type === "VehicleBroken");
    if (!broken) return false;
    this.world.dropVehicleItem(cmd.vehicleId);
    this.world.removeVehicle(cmd.vehicleId);
    this.repo.remove(cmd.vehicleId);
    const fleet = this.fleets.load();
    fleet.forget(cmd.vehicleId);
    this.fleets.save(fleet);
    return true;
  }
}
