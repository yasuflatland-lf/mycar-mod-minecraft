// src/application/driveVehicles.ts
// ユースケース: 毎 tick、読み込まれている全車を動かす。
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
          vehicle = Vehicle.create(snap.id, snap.yaw); // 再読み込み後は速度 0、向きはエンティティから作り直す
          this.repo.save(vehicle);
        }
        const out = vehicle.tick({
          tick,
          riders: snap.riders,
          testInput: snap.testInput,
          velocity: snap.velocity,
          onGround: snap.onGround,
          solidAt: (offset) => this.world.solidAt(snap.id, offset),
          targets: () => this.world.targetsNear(snap.id),
        });
        this.world.applyMotion(snap.id, out.impulse, out.yaw);
        for (const hit of out.hits) this.world.damage(hit, out.driverId);
        for (const e of out.events)
          if (e.type === "SeatVacated") this.world.playDoor(snap.id, e.door);
      } catch (e) {
        this.log.warn(`[mycar] ${snap.id}: ${e}`); // 1 台の失敗で他の車を止めない
      }
    }
    for (const id of this.repo.ids()) if (!seen.has(id)) this.repo.remove(id);
  }
}
