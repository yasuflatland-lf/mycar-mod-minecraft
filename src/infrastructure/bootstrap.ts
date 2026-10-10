// src/infrastructure/bootstrap.ts
// 組み立て: リポジトリ・ポートの実装・ユースケースをつなぐ。
import { DriveVehicles } from "../application/driveVehicles";
import { HitVehicle } from "../application/hitVehicle";
import { PlaceVehicle } from "../application/placeVehicle";
import { BedrockVehicleWorld } from "./bedrock/bedrockVehicleWorld";
import { registerSubscriptions } from "./bedrock/subscriptions";
import { InMemoryVehicleRepository } from "./persistence/inMemoryVehicleRepository";

export function bootstrap(): void {
  const repo = new InMemoryVehicleRepository();
  const bedrock = new BedrockVehicleWorld();
  const log = { warn: (m: string) => console.warn(m) };
  registerSubscriptions({
    drive: new DriveVehicles(bedrock, repo, log),
    place: new PlaceVehicle(bedrock, repo),
    hit: new HitVehicle(bedrock, repo),
  });
  console.warn("[mycar] loaded");
}
