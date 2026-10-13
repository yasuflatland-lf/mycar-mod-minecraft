// Capabilities the application layer requires from the game (ports). Implementations live in the infrastructure layer (ADR 0012).
import type { Vec3 } from "../../domain/shared/vec";
import type { EngineCommand, RestoredValues } from "../../domain/vehicle/drive";
import type { RawInput } from "../../domain/vehicle/driveInput";
import type { FleetEntry } from "../../domain/vehicle/fleet";
import type { FloorCell, HoldPose } from "../../domain/vehicle/floor";
import type { Cell } from "../../domain/vehicle/headlights";
import type { VehicleKind } from "../../domain/vehicle/kind";
import type { Paint } from "../../domain/vehicle/paint";
import type { RamHit, RamTarget } from "../../domain/vehicle/ram";
import type { RiderView } from "../../domain/vehicle/vehicle";

export interface VehicleSnapshot {
  kind: VehicleKind;
  id: string;
  location: Vec3;
  yaw: number;
  velocity: Vec3;
  onGround: boolean;
  riders: RiderView[];
  deckSeatInputs: (RawInput | undefined)[];
  restored(): RestoredValues;
  headlights: boolean;
  testInput?: RawInput;
}

export interface DriveWorld {
  loadedVehicles(): VehicleSnapshot[];
  keepDeckSeats(
    vehicleId: string,
    positions: readonly (Vec3 | undefined)[],
    yaw: number,
  ): void;
  boardDeckRiders(vehicleId: string): void;
  waterAt(vehicleId: string, offset: Vec3): boolean;
  solidAt(vehicleId: string, offset: Vec3): boolean;
  targetsNear(vehicleId: string): RamTarget[];
  /** While a pose is set, teleports the vehicle there and clears its velocity every tick instead of applying the impulse. */
  holdAt(vehicleId: string, pose: HoldPose | undefined): void;
  /**
   * Keeps yasu_ride:deck_floor in exactly these cells for the vehicle and clears
   * the ones it laid before. Also called with no cells for a vehicle that is gone.
   */
  layFloor(vehicleId: string, cells: readonly FloorCell[]): void;
  applyMotion(vehicleId: string, impulse: Vec3, yaw: number): void;
  run(vehicleId: string, commands: readonly EngineCommand[]): void;
  /** Switches a player's view to the third-person camera, or back to their own (ADR 0028). */
  setThirdPerson(playerId: string, on: boolean): void;
  /** Refreshes water breathing; does nothing for a missing player (ADR 0040). */
  giveWaterBreathing(playerId: string, ticks: number): void;
  damage(hit: RamHit, attackerId: string | undefined): void;
  /**
   * Keeps light blocks in exactly these cells for the vehicle and clears the
   * ones it lit before. Also called with no cells for a vehicle that is gone.
   */
  shineHeadlights(vehicleId: string, cells: readonly Cell[]): void;
}

export interface PlacementWorld {
  isAir(dimensionId: string, at: Vec3): boolean;
  spawnVehicle(
    dimensionId: string,
    at: Vec3,
    yaw: number,
    kind: VehicleKind,
    ownerId: string,
  ): string;
  /** Takes one vehicle item from `slot`. False when that slot no longer holds one. */
  consumeVehicleItem(
    playerId: string,
    slot: number,
    kind: VehicleKind,
  ): boolean;
}

export interface StarterWorld {
  /** undefined when the player is no longer in the world. */
  receivedStarter(playerId: string): boolean | undefined;
  /** Puts one item of this kind in the inventory, or at the player's feet when it is full. */
  giveVehicleItem(playerId: string, kind: VehicleKind): void;
  markStarterReceived(playerId: string): void;
}

export interface BreakWorld {
  dropVehicleItem(vehicleId: string): void;
  removeVehicle(vehicleId: string): void;
}

export interface LimitWorld {
  /** Vehicles in loaded chunks, in every dimension. */
  loadedFleetEntries(): FleetEntry[];
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
