// Capabilities the application layer requires from the game (ports). Implementations live in the infrastructure layer (ADR 0012).
import type { Vec2, Vec3 } from "../domain/shared/vec";
import type { RawInput } from "../domain/vehicle/driveInput";
import type { Cell } from "../domain/vehicle/headlights";
import type { Paint } from "../domain/vehicle/paint";
import type { RamHit, RamTarget } from "../domain/vehicle/ram";
import type { RiderView } from "../domain/vehicle/vehicle";

export interface VehicleSnapshot {
  id: string;
  location: Vec3;
  yaw: number;
  velocity: Vec2;
  onGround: boolean;
  riders: RiderView[];
  headlights: boolean;
  testInput?: RawInput;
}

export interface DriveWorld {
  loadedVehicles(): VehicleSnapshot[];
  solidAt(vehicleId: string, offset: Vec3): boolean;
  targetsNear(vehicleId: string): RamTarget[];
  applyMotion(vehicleId: string, impulse: Vec3, yaw: number): void;
  damage(hit: RamHit, attackerId: string | undefined): void;
  playDoor(vehicleId: string, door: string): void;
  /**
   * Keeps light blocks in exactly these cells for the vehicle and clears the
   * ones it lit before. Also called with no cells for a vehicle that is gone.
   */
  shineHeadlights(vehicleId: string, cells: readonly Cell[]): void;
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

export interface PaintWorld {
  /** undefined when the vehicle no longer exists. */
  paintOf(vehicleId: string): Paint | undefined;
  paint(vehicleId: string, paint: Paint): void;
  consumeDye(playerId: string, paint: Paint): void;
}

export interface HeadlightWorld {
  /** undefined when the vehicle no longer exists. */
  headlightsOn(vehicleId: string): boolean | undefined;
  setHeadlights(vehicleId: string, on: boolean): void;
}

export interface Logger {
  warn(message: string): void;
}
