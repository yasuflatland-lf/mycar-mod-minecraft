// Use case: give each player one vehicle item the first time they join the world (ADR 0023).
import type { VehicleKind } from "../../domain/vehicle/kind";
import type { StarterWorld } from "./ports";

// The SUV drives on land, where every new player starts (ADR 0023).
const STARTER_KIND: VehicleKind = "suv";

export class GiveStarterVehicle {
  constructor(private readonly world: StarterWorld) {}

  execute(playerId: string): boolean {
    if (this.world.receivedStarter(playerId) !== false) return false;
    // Marking only after giving means a give that throws is retried on the
    // next join instead of leaving the player without a vehicle.
    this.world.giveVehicleItem(playerId, STARTER_KIND);
    this.world.markStarterReceived(playerId);
    return true;
  }
}
