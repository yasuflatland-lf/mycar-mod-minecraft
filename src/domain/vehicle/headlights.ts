// Where a vehicle with its headlights on puts light blocks (ADR 0020).
import { forward, type Vec3 } from "../shared/vec";
import { SPEC } from "./spec";

/** Block cell, as integer coordinates. */
export type Cell = Vec3;

export const cellKey = (c: Cell): string => `${c.x},${c.y},${c.z}`;

/**
 * Cells ahead of a vehicle at `location` facing `yaw`, one per reach in
 * SPEC.headlightReach, one block above the ground the vehicle stands on.
 */
export function headlightCells(location: Vec3, yaw: number): Cell[] {
  const f = forward(yaw);
  const y = Math.floor(location.y) + 1;
  const cells = new Map<string, Cell>();
  for (const reach of SPEC.headlightReach) {
    const c = {
      x: Math.floor(location.x + f.x * reach),
      y,
      z: Math.floor(location.z + f.z * reach),
    };
    cells.set(cellKey(c), c);
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
