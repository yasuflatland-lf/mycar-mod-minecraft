// Use case: give each player one vehicle item the first time they join the world (ADR 0021).
import type { StarterWorld } from "./ports";

export class GiveStarterVehicle {
  constructor(private readonly world: StarterWorld) {}

  execute(playerId: string): boolean {
    if (this.world.receivedStarter(playerId) !== false) return false;
    this.world.giveVehicleItem(playerId);
    this.world.markStarterReceived(playerId);
    return true;
  }
}
