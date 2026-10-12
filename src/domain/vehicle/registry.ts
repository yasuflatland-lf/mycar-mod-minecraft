// The only way to build a vehicle: every caller names the kind, so none falls back to SUV values (ADR 0055).
import { isForm } from "./form";
import type { VehicleKind } from "./kind";
import { type RiderView, Vehicle } from "./vehicle";

export type RestoredValues = Readonly<
  Record<string, string | number | boolean | undefined>
>;

export function createVehicle(
  kind: VehicleKind,
  id: string,
  yaw: number,
): Vehicle {
  return Vehicle.create(id, yaw, kind);
}

/** Rebuilds a vehicle whose aggregate was lost; `restored` holds the entity properties read back (only `form` for now). */
export function rebuildVehicle(
  kind: VehicleKind,
  id: string,
  yaw: number,
  riders: readonly RiderView[],
  restored: RestoredValues,
): Vehicle {
  const form = isForm(restored.form) ? restored.form : "car";
  return Vehicle.rebuild(id, yaw, riders, form, kind);
}
