// Use case: every tick, move all loaded vehicles.
import { Vehicle } from "../domain/vehicle/vehicle";
import type { VehicleRepository } from "../domain/vehicle/vehicleRepository";
import type { DriveWorld, Logger } from "./ports";

export class DriveVehicles {
  constructor(
    private readonly world: DriveWorld,
    private readonly repo: VehicleRepository,
    private readonly log: Logger,
  ) {}

  execute(tick: number): void {
    const seen = new Set<string>();
    for (const snap of this.world.loadedVehicles()) {
      seen.add(snap.id);
      try {
        let vehicle = this.repo.get(snap.id);
        if (!vehicle) {
          // The aggregate is lost after a reload: rebuild it with zero speed,
          // the entity's heading, the riders already seated (so the current
          // driver is not treated as newly mounted), and the flight mode
          // stored on the entity (ADR 0020).
          vehicle = Vehicle.rebuild(
            snap.id,
            snap.yaw,
            snap.riders,
            snap.flight,
          );
          this.repo.save(vehicle);
        }
        const out = vehicle.tick({
          tick,
          riders: snap.riders,
          testInput: snap.testInput,
          velocity: snap.velocity,
          velocityY: snap.velocityY,
          onGround: snap.onGround,
          solidAt: (offset) => this.world.solidAt(snap.id, offset),
          targets: () => this.world.targetsNear(snap.id),
        });
        this.world.applyMotion(snap.id, out.impulse, out.yaw);
        if (out.flight) this.world.setFlight(snap.id, out.flight);
        for (const hit of out.hits) this.world.damage(hit, out.driverId);
        for (const event of out.events) {
          if (event.type === "SeatVacated") {
            this.world.playDoor(snap.id, event.door);
          }
        }
      } catch (e) {
        // A failure in one vehicle must not stop the others.
        this.log.warn(`[mycar] ${snap.id}: ${e}`);
      }
    }
    for (const id of this.repo.ids()) if (!seen.has(id)) this.repo.remove(id);
  }
}
