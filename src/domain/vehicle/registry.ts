// The only way to build a vehicle: every caller names the kind, so none falls back to SUV values (ADR 0055).
import { BoatDrive } from "./boatDrive";
import type { Drive } from "./drive";
import { type Form, isForm } from "./form";
import type { VehicleKind } from "./kind";
import { profileOf } from "./profile";
import { SuvDrive } from "./suvDrive";
import { type RiderView, Vehicle } from "./vehicle";

export type RestoredValues = Readonly<
  Record<string, string | number | boolean | undefined>
>;

/** Kinds without forms ignore `form`. */
function driveOf(kind: VehicleKind, yaw: number, form: Form): Drive {
  switch (kind) {
    case "suv":
      return new SuvDrive(yaw, form);
    case "sportsboat":
      return new BoatDrive(yaw);
  }
}

export function createVehicle(
  kind: VehicleKind,
  id: string,
  yaw: number,
): Vehicle {
  return new Vehicle(id, profileOf(kind), driveOf(kind, yaw, "car"));
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
  const form = isForm(restored.form) ? restored.form : "car";
  const vehicle = new Vehicle(id, profileOf(kind), driveOf(kind, yaw, form));
  vehicle.seatRiders(riders, yaw);
  return vehicle;
}
