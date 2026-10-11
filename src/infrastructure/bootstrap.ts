// Composition root: wires the repository, port implementations, and use cases together.
import { DriveVehicles } from "../application/driveVehicles";
import { HitVehicle } from "../application/hitVehicle";
import { PaintVehicle } from "../application/paintVehicle";
import { PlaceVehicle } from "../application/placeVehicle";
import { BedrockVehicleWorld } from "./bedrock/bedrockVehicleWorld";
import { registerSubscriptions } from "./bedrock/subscriptions";
import { InMemoryVehicleRepository } from "./persistence/inMemoryVehicleRepository";
import { TestInputStore } from "./testInput/testInputStore";

export function bootstrap(): void {
  const repo = new InMemoryVehicleRepository();
  const store = new TestInputStore();
  const bedrock = new BedrockVehicleWorld(store);
  const log = { warn: (m: string) => console.warn(m) };
  registerSubscriptions(
    {
      drive: new DriveVehicles(bedrock, repo, log),
      place: new PlaceVehicle(bedrock, repo),
      hit: new HitVehicle(bedrock, repo),
      paint: new PaintVehicle(bedrock),
    },
    store,
  );
  console.warn("[mycar] loaded");
}
