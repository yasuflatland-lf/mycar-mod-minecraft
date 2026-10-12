// Kind-neutral hold pose and collision floor cells for a stopped vehicle (ADR 0063).
import { cellKey } from "./headlights";

export interface HoldPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

export interface FloorCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Collision height in pixels, 1..16. */
  readonly height: number;
}

/** Cells to clear and cells to place or resize to go from laid to wanted. */
export function refloor(
  laid: readonly FloorCell[],
  wanted: readonly FloorCell[],
): { clear: FloorCell[]; place: FloorCell[] } {
  const laidByKey = new Map(laid.map((c) => [cellKey(c), c]));
  const wantedKeys = new Set(wanted.map(cellKey));
  return {
    clear: laid.filter((c) => !wantedKeys.has(cellKey(c))),
    place: wanted.filter((c) => laidByKey.get(cellKey(c))?.height !== c.height),
  };
}
