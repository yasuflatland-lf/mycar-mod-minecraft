// src/application/ports.ts
// アプリケーション層がゲーム側に求める機能 (ポート)。実装はインフラストラクチャ層にある (ADR 0012)。
import type { Vec2, Vec3 } from "../domain/shared/vec";
import type { RawInput } from "../domain/vehicle/driveInput";
import type { RamHit, RamTarget } from "../domain/vehicle/ram";
import type { RiderView } from "../domain/vehicle/vehicle";

export interface VehicleSnapshot {
  id: string;
  yaw: number;
  velocity: Vec2;
  onGround: boolean;
  riders: RiderView[];
  testInput?: RawInput;
}

export interface DriveWorld {
  loadedVehicles(): VehicleSnapshot[];
  solidAt(vehicleId: string, offset: Vec3): boolean;
  targetsNear(vehicleId: string): RamTarget[];
  applyMotion(vehicleId: string, impulse: Vec3, yaw: number): void;
  damage(hit: RamHit, attackerId: string | undefined): void;
  playDoor(vehicleId: string, door: string): void;
}

export interface PlacementWorld {
  isAir(dimensionId: string, at: Vec3): boolean;
  spawnVehicle(dimensionId: string, at: Vec3, yaw: number): string;
  consumeVehicleItem(playerId: string): void;
}

export interface BreakWorld {
  dropVehicleItem(vehicleId: string): void;
  removeVehicle(vehicleId: string): void;
}

export interface Logger {
  warn(message: string): void;
}
