export type VehicleEvent =
  | {
      type: "SeatVacated";
      vehicleId: string;
      seat: number;
      door: string | undefined;
    }
  | { type: "VehicleBroken"; vehicleId: string };
