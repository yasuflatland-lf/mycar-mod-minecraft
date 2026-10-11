// Use case: every tick, move all loaded vehicles.
import { headlightCells } from "../domain/vehicle/headlights";
import { SPEC } from "../domain/vehicle/spec";
import { Vehicle } from "../domain/vehicle/vehicle";
import type { VehicleRepository } from "../domain/vehicle/vehicleRepository";
import type { DriveWorld, Logger } from "./ports";

export class DriveVehicles {
  /** Players this use case switched to the third-person camera (ADR 0028). */
  private readonly thirdPerson = new Set<string>();
  /** Players whose camera switch failed and was logged, so a retry every tick logs once. */
  private readonly cameraFailed = new Set<string>();

  constructor(
    private readonly world: DriveWorld,
    private readonly repo: VehicleRepository,
    private readonly log: Logger,
  ) {}

  execute(tick: number): void {
    const seen = new Set<string>();
    // Riders of any form but car use third person (ADR 0028 + 0037).
    const offRoad = new Set<string>();
    const underwater = new Set<string>();
    for (const snap of this.world.loadedVehicles()) {
      seen.add(snap.id);
      try {
        let vehicle = this.repo.get(snap.id);
        if (!vehicle) {
          // The aggregate is lost after a reload: rebuild it with zero speed,
          // the entity's heading, the riders already seated (so the current
          // driver is not treated as newly mounted), and the vehicle form
          // stored on the entity (ADR 0021, 0037).
          vehicle = Vehicle.rebuild(snap.id, snap.yaw, snap.riders, snap.form);
          this.repo.save(vehicle);
        }
        const out = vehicle.tick({
          tick,
          riders: snap.riders,
          testInput: snap.testInput,
          velocity: snap.velocity,
          velocityY: snap.velocityY,
          onGround: snap.onGround,
          waterDepth: snap.waterDepth,
          solidAt: (offset) => this.world.solidAt(snap.id, offset),
          targets: () => this.world.targetsNear(snap.id),
        });
        // The form, the bank, and the gear are sent only on the tick they change, so
        // send them before anything else that could throw and skip them.
        if (out.form) this.world.setForm(snap.id, out.form);
        if (out.bank !== undefined) this.world.setBank(snap.id, out.bank);
        if (out.gearDown !== undefined)
          this.world.setGearDown(snap.id, out.gearDown);
        if (vehicle.form !== "car")
          for (const rider of snap.riders) offRoad.add(rider.id);
        if (vehicle.form === "submarine")
          for (const rider of snap.riders) underwater.add(rider.id);
        this.world.applyMotion(snap.id, out.impulse, out.yaw);
        this.world.shineHeadlights(
          snap.id,
          snap.headlights ? headlightCells(snap.location, out.yaw) : [],
        );
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
    for (const id of this.repo.ids()) {
      if (seen.has(id)) continue;
      this.repo.remove(id);
      try {
        this.world.shineHeadlights(id, []);
      } catch (e) {
        this.log.warn(`[mycar] ${id}: ${e}`);
      }
    }
    this.syncCameras(offRoad);
    if (tick % SPEC.waterBreathingInterval === 0) {
      for (const id of underwater) {
        try {
          this.world.giveWaterBreathing(id, SPEC.waterBreathingTicks);
        } catch (e) {
          this.log.warn(`[mycar] breathing ${id}: ${e}`);
        }
      }
    }
  }

  /**
   * Riders of any form but car see the vehicle from behind; everyone this use
   * case switched gets their own view back once they land or get off. A failed
   * switch either way is retried on the next tick. A player who left needs no
   * clearing: the world does nothing for a missing player, so they are dropped.
   */
  private syncCameras(offRoad: ReadonlySet<string>): void {
    for (const id of offRoad)
      if (!this.thirdPerson.has(id) && this.switchCamera(id, true))
        this.thirdPerson.add(id);
    for (const id of this.thirdPerson)
      if (!offRoad.has(id) && this.switchCamera(id, false))
        this.thirdPerson.delete(id);
  }

  private switchCamera(id: string, thirdPerson: boolean): boolean {
    try {
      this.world.setThirdPerson(id, thirdPerson);
      this.cameraFailed.delete(id);
      return true;
    } catch (e) {
      if (!this.cameraFailed.has(id))
        this.log.warn(`[mycar] camera ${id}: ${e}`);
      this.cameraFailed.add(id);
      return false;
    }
  }
}
