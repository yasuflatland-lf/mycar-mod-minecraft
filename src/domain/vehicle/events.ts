export type VehicleEvent =
  | { type: "SeatVacated"; vehicleId: string; seat: number; door: string }
  | { type: "VehicleBroken"; vehicleId: string };
