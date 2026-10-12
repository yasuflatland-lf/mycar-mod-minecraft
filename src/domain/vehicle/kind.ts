export const VEHICLE_KINDS = ["suv", "sportsboat"] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

export function isVehicleKind(value: unknown): value is VehicleKind {
  return VEHICLE_KINDS.some((kind) => kind === value);
}
