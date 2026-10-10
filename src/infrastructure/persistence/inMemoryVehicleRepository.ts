// src/infrastructure/persistence/inMemoryVehicleRepository.ts
// 集約はメモリにだけ置く。スクリプトの再読み込みで消え、DriveVehicles が作り直す (ADR 0012)。
import type { Vehicle } from "../../domain/vehicle/vehicle";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";

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
