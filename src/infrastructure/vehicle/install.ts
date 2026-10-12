// Wires the vehicle feature's repositories, port implementations, and use cases
// together.
import { DriveVehicles } from "../../application/vehicle/driveVehicles";
import { GiveStarterVehicle } from "../../application/vehicle/giveStarterVehicle";
import { HitVehicle } from "../../application/vehicle/hitVehicle";
import { LimitVehicles } from "../../application/vehicle/limitVehicles";
import { PaintVehicle } from "../../application/vehicle/paintVehicle";
import { PlaceVehicle } from "../../application/vehicle/placeVehicle";
import { SwitchHeadlights } from "../../application/vehicle/switchHeadlights";
import { BedrockVehicleWorld } from "./bedrock/bedrockVehicleWorld";
import { registerSubscriptions } from "./bedrock/subscriptions";
import { DynamicPropertyFleetRepository } from "./persistence/dynamicPropertyFleetRepository";
import { InMemoryVehicleRepository } from "./persistence/inMemoryVehicleRepository";
import { TestInputStore } from "./testInput/testInputStore";

export function installVehicles(): void {
  const repo = new InMemoryVehicleRepository();
  const store = new TestInputStore();
  const bedrock = new BedrockVehicleWorld(store);
  const log = { warn: (m: string) => console.warn(m) };
  const fleets = new DynamicPropertyFleetRepository(log);
  registerSubscriptions(
    {
      drive: new DriveVehicles(bedrock, repo, log),
      place: new PlaceVehicle(bedrock, repo),
      starter: new GiveStarterVehicle(bedrock),
      hit: new HitVehicle(bedrock, repo, fleets),
      limit: new LimitVehicles(bedrock, repo, fleets, log),
      paint: new PaintVehicle(bedrock),
      headlights: new SwitchHeadlights(bedrock, repo),
    },
    store,
  );
}
