// Use case: keep at most SPEC.maxVehicles vehicles in a world by removing the oldest (ADR 0038).
import type { Fleet } from "../domain/vehicle/fleet";
import type { FleetRepository } from "../domain/vehicle/fleetRepository";
import { SPEC } from "../domain/vehicle/spec";
import type { VehicleRepository } from "../domain/vehicle/vehicleRepository";
import type { LimitWorld, Logger } from "./ports";

export class LimitVehicles {
  constructor(
    private readonly world: LimitWorld,
    private readonly repo: VehicleRepository,
    private readonly fleets: FleetRepository,
    private readonly log: Logger,
  ) {}

  /** Reads back the vehicles already loaded when the script starts. */
  start(): void {
    this.found(this.world.loadedVehicleIds());
  }

  /**
   * A vehicle was just created, from the item or a command. Removes the loaded
   * vehicles this or an earlier eviction pushed out.
   */
  spawned(vehicleId: string): void {
    const fleet = this.fleets.load();
    fleet.admit(vehicleId);
    this.removeLoadedEvicted(fleet);
    this.fleets.save(fleet);
  }

  /**
   * Vehicles read back from the world: a chunk loaded, or the script started.
   * One the fleet never saw spawn was there before the limit existed, so it
   * counts as older than every vehicle the fleet saw spawn.
   */
  found(vehicleIds: readonly string[]): void {
    const fleet = this.fleets.load();
    let changed = false;
    for (const id of vehicleIds) {
      if (fleet.knows(id)) continue;
      fleet.admitAsOldest(id);
      changed = true;
    }
    if (this.removeLoadedEvicted(fleet) || changed) this.fleets.save(fleet);
  }

  private removeLoadedEvicted(fleet: Fleet): boolean {
    let removed = false;
    for (const id of this.world.loadedVehicleIds()) {
      if (!fleet.isEvicted(id)) continue;
      // One failure must not cost the others, or the save of the fleet.
      try {
        this.world.removeVehicle(id);
        this.repo.remove(id);
        fleet.forget(id);
        removed = true;
        this.log.warn(`[mycar] ${id}: removed, over ${SPEC.maxVehicles}`);
      } catch (e) {
        this.log.warn(`[mycar] ${id}: ${e}`);
      }
    }
    return removed;
  }
}
