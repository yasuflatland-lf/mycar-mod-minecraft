// What a held vehicle keeps around it while it stands still (ADR 0063, 0064).
import type { Vec3 } from "../shared/vec";
import type { FloorCell, HoldPose } from "./floor";

/** Present only while a drive holds its vehicle; a kind that never holds never returns one. */
export interface Dock {
  readonly hold: HoldPose;
  readonly floor: readonly FloorCell[];
  /** Deck seat i stands at seat i of the vehicle's profile; undefined where that seat has a rider. */
  readonly seats: readonly (Vec3 | undefined)[];
}
