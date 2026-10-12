// Use case: a player hits a vehicle with a dye to repaint its body (ADR 0031, 0036).
import type { Paint } from "../../domain/vehicle/paint";
import type { PaintWorld } from "./ports";

export interface PaintVehicleCommand {
  playerId: string;
  vehicleId: string;
  paint: Paint;
  creative: boolean;
  tick: number;
}

export class PaintVehicle {
  // The engine applies a paint on the next tick, so until then paintOf still
  // reports the old color and a second hit in the same tick would repaint and
  // use another dye (ADR 0037). Paints made in the current tick override it.
  private paintedTick = -1;
  private readonly painted = new Map<string, Paint>();

  constructor(private readonly world: PaintWorld) {}

  execute(cmd: PaintVehicleCommand): boolean {
    if (cmd.tick !== this.paintedTick) {
      this.painted.clear();
      this.paintedTick = cmd.tick;
    }
    const current =
      this.painted.get(cmd.vehicleId) ?? this.world.paintOf(cmd.vehicleId);
    // A dye of the color the vehicle already has would be used up for nothing.
    if (current === undefined || current === cmd.paint) return false;
    this.world.paint(cmd.vehicleId, cmd.paint);
    this.painted.set(cmd.vehicleId, cmd.paint);
    if (!cmd.creative) this.world.consumeDye(cmd.playerId, cmd.paint);
    return true;
  }
}
