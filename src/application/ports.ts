// Capabilities the application layer requires from the game (ports). Implementations live in the infrastructure layer (ADR 0012).
import type { Vec2, Vec3 } from "../domain/shared/vec";
import type { RawInput } from "../domain/vehicle/driveInput";
import type { FlightMode } from "../domain/vehicle/flight";
import type { Paint } from "../domain/vehicle/paint";
import type { RamHit, RamTarget } from "../domain/vehicle/ram";
import type { RiderView } from "../domain/vehicle/vehicle";

export interface VehicleSnapshot {
  id: string;
  yaw: number;
  velocity: Vec2;
  velocityY: number;
  onGround: boolean;
  riders: RiderView[];
  flight: FlightMode;
  testInput?: RawInput;
}

export interface DriveWorld {
  loadedVehicles(): VehicleSnapshot[];
  solidAt(vehicleId: string, offset: Vec3): boolean;
  targetsNear(vehicleId: string): RamTarget[];
  applyMotion(vehicleId: string, impulse: Vec3, yaw: number): void;
  setFlight(vehicleId: string, mode: FlightMode): void;
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

export interface PaintWorld {
  /** undefined when the vehicle no longer exists. */
  paintOf(vehicleId: string): Paint | undefined;
  paint(vehicleId: string, paint: Paint): void;
  consumeDye(playerId: string, paint: Paint): void;
}

export interface Logger {
  warn(message: string): void;
}
