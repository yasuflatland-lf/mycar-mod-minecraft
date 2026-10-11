// Use case: a player uses the headlight switch while riding a vehicle (ADR 0020).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { HeadlightWorld } from "./ports";

export interface SwitchHeadlightsCommand {
  playerId: string;
  vehicleId: string;
  tick: number;
}

export class SwitchHeadlights {
  constructor(
    private readonly world: HeadlightWorld,
    private readonly repo: VehicleRepository,
  ) {}

  execute(cmd: SwitchHeadlightsCommand): boolean {
    const vehicle = this.repo.get(cmd.vehicleId);
    if (!vehicle?.flipHeadlightSwitch(cmd.playerId, cmd.tick)) return false;
    const on = this.world.headlightsOn(cmd.vehicleId);
    if (on === undefined) return false;
    this.world.setHeadlights(cmd.vehicleId, !on);
    return true;
  }
}
