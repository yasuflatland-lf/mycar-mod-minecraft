// Use case: every tick, move all loaded vehicles.
import { headlightCells } from "../../domain/vehicle/headlights";
import { profileOf, rebuildVehicle } from "../../domain/vehicle/kinds/index";
import { SPEC } from "../../domain/vehicle/spec";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
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
    const offRoad = new Set<string>();
    const underwater = new Set<string>();
    for (const snap of this.world.loadedVehicles()) {
      seen.add(snap.id);
      try {
        let vehicle = this.repo.get(snap.id);
        if (!vehicle) {
          // The aggregate is lost after a reload: rebuild it with zero speed,
          // the entity's heading, the riders already seated (so the current
          // driver is not treated as newly mounted), and its restored properties
          // stored on the entity (ADR 0021, 0039).
          vehicle = rebuildVehicle(
            snap.kind,
            snap.id,
            snap.yaw,
            snap.riders,
            snap.restored(),
          );
          this.repo.save(vehicle);
        }
        const out = vehicle.tick({
          tick,
          riders: snap.riders,
          deckSeatInputs: snap.deckSeatInputs,
          testInput: snap.testInput,
          location: snap.location,
          velocity: snap.velocity,
          onGround: snap.onGround,
          waterAt: (offset) => this.world.waterAt(snap.id, offset),
          solidAt: (offset) => this.world.solidAt(snap.id, offset),
          targets: () => this.world.targetsNear(snap.id),
        });
        // Commands are sent on change, so send them before anything else that could throw.
        this.world.run(snap.id, out.commands);
        this.world.holdAt(snap.id, out.dock?.hold);
        if (out.riders.thirdPerson)
          for (const rider of snap.riders) offRoad.add(rider.id);
        if (out.riders.underwater)
          for (const rider of snap.riders) underwater.add(rider.id);
        if (!out.dock) this.world.applyMotion(snap.id, out.impulse, out.yaw);
        if (out.boardDeckRiders) this.world.boardDeckRiders(snap.id);
        this.world.keepDeckSeats(snap.id, out.dock?.seats ?? [], out.yaw);
        this.world.layFloor(snap.id, out.dock?.floor ?? []);
        this.world.shineHeadlights(
          snap.id,
          snap.headlights
            ? headlightCells(
                snap.location,
                out.yaw,
                profileOf(vehicle.kind).beams,
              )
            : [],
        );
        for (const hit of out.hits) this.world.damage(hit, out.driverId);
        this.world.run(snap.id, out.seatCommands);
      } catch (e) {
        // A failure in one vehicle must not stop the others.
        this.log.warn(`${snap.id}: ${e}`);
      }
    }
    for (const id of this.repo.ids()) {
      if (seen.has(id)) continue;
      this.repo.remove(id);
      // Each release runs on its own so one failure does not skip the others.
      for (const release of [
        () => this.world.keepDeckSeats(id, [], 0),
        () => this.world.shineHeadlights(id, []),
        () => this.world.layFloor(id, []),
        () => this.world.holdAt(id, undefined),
      ]) {
        try {
          release();
        } catch (e) {
          this.log.warn(`${id}: ${e}`);
        }
      }
    }
    this.syncCameras(offRoad);
    if (tick % SPEC.waterBreathingInterval === 0)
      this.refreshWaterBreathing(underwater);
  }

  private refreshWaterBreathing(underwater: ReadonlySet<string>): void {
    for (const id of underwater) {
      try {
        this.world.giveWaterBreathing(id, SPEC.waterBreathingTicks);
      } catch (e) {
        // One failed refresh must not skip the other riders.
        this.log.warn(`breathing ${id}: ${e}`);
      }
    }
  }

  /**
   * Each drive chooses its riders' view; everyone this use case switched
   * gets their own view back when requested or when they get off. A failed
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
      if (!this.cameraFailed.has(id)) this.log.warn(`camera ${id}: ${e}`);
      this.cameraFailed.add(id);
      return false;
    }
  }
}
