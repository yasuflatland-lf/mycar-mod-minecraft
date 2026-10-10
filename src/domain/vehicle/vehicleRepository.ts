import type { Vehicle } from "./vehicle";

export interface VehicleRepository {
  get(id: string): Vehicle | undefined;
  save(vehicle: Vehicle): void;
  remove(id: string): void;
  ids(): string[];
}
