// Where a vehicle with its headlights on puts light blocks (ADR 0020).
import { forward, rightOf, type Vec3 } from "../shared/vec";
import type { BeamPattern } from "./profile";

/** Block cell, as integer coordinates. */
export type Cell = Vec3;

export const cellKey = (c: Cell): string => `${c.x},${c.y},${c.z}`;

/**
 * Cells ahead of a vehicle at `location` facing `yaw`: the distinct cells
 * reached by each reach and lane in `beams` (pairs that floor to the same
 * block share one cell), one block above the ground the vehicle stands on.
 */
export function headlightCells(
  location: Vec3,
  yaw: number,
  beams: BeamPattern,
): Cell[] {
  const f = forward(yaw);
  const right = rightOf(f);
  const y = Math.floor(location.y) + 1;
  const cells = new Map<string, Cell>();
  for (const reach of beams.reach) {
    for (const lane of beams.lanes) {
      const c = {
        x: Math.floor(location.x + f.x * reach + right.x * lane),
        y,
        z: Math.floor(location.z + f.z * reach + right.z * lane),
      };
      cells.set(cellKey(c), c);
    }
  }
  return [...cells.values()];
}

/** Which lit cells to clear and which to light to go from `lit` to `wanted`. */
export function relight(
  lit: readonly Cell[],
  wanted: readonly Cell[],
): { clear: Cell[]; light: Cell[] } {
  const litKeys = new Set(lit.map(cellKey));
  const wantedKeys = new Set(wanted.map(cellKey));
  return {
    clear: lit.filter((c) => !wantedKeys.has(cellKey(c))),
    light: wanted.filter((c) => !litKeys.has(cellKey(c))),
  };
}
