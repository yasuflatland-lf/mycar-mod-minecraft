// Use case: a player hits a vehicle with a dye to repaint its body (ADR 0031, 0036).
import type { Paint } from "../domain/vehicle/paint";
import type { PaintWorld } from "./ports";

export interface PaintVehicleCommand {
  playerId: string;
  vehicleId: string;
  paint: Paint;
  creative: boolean;
}

export class PaintVehicle {
  constructor(private readonly world: PaintWorld) {}

  execute(cmd: PaintVehicleCommand): boolean {
    const current = this.world.paintOf(cmd.vehicleId);
    // A dye of the color the vehicle already has would be used up for nothing.
    if (current === undefined || current === cmd.paint) return false;
    this.world.paint(cmd.vehicleId, cmd.paint);
    if (!cmd.creative) this.world.consumeDye(cmd.playerId, cmd.paint);
    return true;
  }
}
