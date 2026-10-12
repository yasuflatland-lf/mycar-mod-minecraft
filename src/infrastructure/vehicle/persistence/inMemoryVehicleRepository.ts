// Aggregates live only in memory. They are lost when the script reloads, and DriveVehicles rebuilds them (ADR 0012).
import type { Vehicle } from "../../../domain/vehicle/vehicle";
import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";

export class InMemoryVehicleRepository implements VehicleRepository {
  private readonly vehicles = new Map<string, Vehicle>();
  get(id: string): Vehicle | undefined {
    return this.vehicles.get(id);
  }
  save(vehicle: Vehicle): void {
    this.vehicles.set(vehicle.id, vehicle);
  }
  remove(id: string): void {
    this.vehicles.delete(id);
  }
  ids(): string[] {
    return [...this.vehicles.keys()];
  }
}
