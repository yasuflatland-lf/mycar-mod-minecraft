// Composition root: wires the repository, port implementations, and use cases together.
import { DriveVehicles } from "../application/driveVehicles";
import { GiveStarterVehicle } from "../application/giveStarterVehicle";
import { HitVehicle } from "../application/hitVehicle";
import { LimitVehicles } from "../application/limitVehicles";
import { PaintVehicle } from "../application/paintVehicle";
import { PlaceVehicle } from "../application/placeVehicle";
import { SwitchHeadlights } from "../application/switchHeadlights";
import { BedrockVehicleWorld } from "./bedrock/bedrockVehicleWorld";
import { registerSubscriptions } from "./bedrock/subscriptions";
import { DynamicPropertyFleetRepository } from "./persistence/dynamicPropertyFleetRepository";
import { InMemoryVehicleRepository } from "./persistence/inMemoryVehicleRepository";
import { TestInputStore } from "./testInput/testInputStore";

export function bootstrap(): void {
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
  console.warn("[mycar] loaded");
}
