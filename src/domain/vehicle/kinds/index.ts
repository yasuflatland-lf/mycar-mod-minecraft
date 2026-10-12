// The only way to build a vehicle: every caller names the kind, so none falls back to SUV values (ADR 0055).
import { BoatDrive } from "../boatDrive";
import type { Drive, RestoredValues } from "../drive";
import type { EntityContract } from "../entityContract";
import type { VehicleKind } from "../kind";
import { profileOf } from "../profile";
import { SPORTSBOAT_ENTITY } from "../sportsboatEntity";
import { SuvDrive } from "../suvDrive";
import { SUV_ENTITY } from "../suvEntity";
import { type RiderView, Vehicle } from "../vehicle";

function driveOf(
  kind: VehicleKind,
  yaw: number,
  restored: RestoredValues,
): Drive {
  switch (kind) {
    case "suv":
      return new SuvDrive(yaw, restored);
    case "sportsboat":
      return new BoatDrive(yaw, restored);
  }
}

export function createVehicle(
  kind: VehicleKind,
  id: string,
  yaw: number,
): Vehicle {
  return new Vehicle(id, profileOf(kind), driveOf(kind, yaw, {}));
}

/**
 * Rebuilds a vehicle whose aggregate was lost; `restored` holds the entity
 * properties read back (only `form` for now). The form comes from the entity,
 * so a vehicle in the air keeps flying (ADR 0021).
 */
export function rebuildVehicle(
  kind: VehicleKind,
  id: string,
  yaw: number,
  riders: readonly RiderView[],
  restored: RestoredValues,
): Vehicle {
  const vehicle = new Vehicle(
    id,
    profileOf(kind),
    driveOf(kind, yaw, restored),
  );
  vehicle.seatRiders(riders, yaw);
  return vehicle;
}

export function entityContractOf(kind: VehicleKind): EntityContract {
  switch (kind) {
    case "suv":
      return SUV_ENTITY;
    case "sportsboat":
      return SPORTSBOAT_ENTITY;
  }
}
