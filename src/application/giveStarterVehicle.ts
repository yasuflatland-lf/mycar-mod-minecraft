// Use case: give each player one vehicle item the first time they join the world (ADR 0023).
import type { StarterWorld } from "./ports";

export class GiveStarterVehicle {
  constructor(private readonly world: StarterWorld) {}

  execute(playerId: string): boolean {
    if (this.world.receivedStarter(playerId) !== false) return false;
    // Marking only after giving means a give that throws is retried on the
    // next join instead of leaving the player without a vehicle.
    this.world.giveVehicleItem(playerId);
    this.world.markStarterReceived(playerId);
    return true;
  }
}
