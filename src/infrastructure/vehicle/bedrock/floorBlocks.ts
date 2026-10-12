// Persistent collision floors for held vehicles (ADR 0063).
import {
  BlockPermutation,
  type Dimension,
  type Entity,
} from "@minecraft/server";
import { type FloorCell, refloor } from "../../../domain/vehicle/floor";
import { cellKey } from "../../../domain/vehicle/headlights";
import { isLightBlock } from "./headlightBlocks";
import {
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  DECK_FLOOR_HEIGHT_STATE,
} from "./identifiers";

// The block defines one collision permutation per pixel height (ADR 0063).
const MIN_HEIGHT = 1;
const MAX_HEIGHT = 16;

interface Laid {
  dimension: Dimension;
  cells: FloorCell[];
}

function isFloorCell(v: unknown): v is FloorCell {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    [c.x, c.y, c.z, c.height].every(Number.isInteger) &&
    typeof c.height === "number" &&
    c.height >= MIN_HEIGHT &&
    c.height <= MAX_HEIGHT
  );
}

// The cells a vehicle laid are saved on the entity, so a /reload or a restart
// can still clear them.
function savedCells(car: Entity): FloorCell[] {
  const raw = car.getDynamicProperty(DECK_CELLS_PROPERTY);
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isFloorCell) : [];
  } catch {
    return [];
  }
}

export class FloorBlocks {
  private readonly laid = new Map<string, Laid>();
  // Cells left in a dimension the vehicle has left because their chunk was
  // unloaded at the time; the saved property only describes the current
  // dimension, so they are kept here until a later tick clears them.
  private stranded: Laid[] = [];

  /** `car` is undefined when the vehicle is gone; its cells are then only cleared. */
  lay(
    vehicleId: string,
    car: Entity | undefined,
    wanted: readonly FloorCell[],
  ) {
    let entry = this.laid.get(vehicleId);
    if (!entry) {
      if (!car) return;
      entry = { dimension: car.dimension, cells: savedCells(car) };
    }
    const before = JSON.stringify(entry.cells);
    if (car && car.dimension.id !== entry.dimension.id) {
      this.update(entry, []);
      if (entry.cells.length > 0) this.stranded.push(entry);
      entry = { dimension: car.dimension, cells: [] };
    }
    this.update(entry, car ? wanted : []);
    if (entry.cells.length > 0) this.laid.set(vehicleId, entry);
    else this.laid.delete(vehicleId);
    if (car?.isValid && JSON.stringify(entry.cells) !== before) {
      car.setDynamicProperty(
        DECK_CELLS_PROPERTY,
        entry.cells.length > 0 ? JSON.stringify(entry.cells) : undefined,
      );
    }
  }

  /**
   * Clears the cells of vehicles that are gone, and retries the cells left in
   * a dimension a vehicle has left. A vehicle removed as its chunk
   * loads may have floor cells in chunks that are not loaded yet, and nothing
   * else asks for its id again (ADR 0038).
   */
  clearGone(live: ReadonlySet<string>): void {
    for (const [id, entry] of this.laid) {
      if (live.has(id)) continue;
      this.update(entry, []);
      if (entry.cells.length === 0) this.laid.delete(id);
    }
    for (const entry of this.stranded) this.update(entry, []);
    this.stranded = this.stranded.filter((entry) => entry.cells.length > 0);
  }

  private update(entry: Laid, wanted: readonly FloorCell[]): void {
    const { clear, place } = refloor(entry.cells, wanted);
    const cleared = new Set<string>();
    for (const c of clear) {
      try {
        const b = entry.dimension.getBlock(c);
        // getBlock may also return undefined for an unloaded chunk; keep the
        // cell then too.
        if (!b) continue;
        // A replacement block belongs to the player, not the vehicle.
        if (b.typeId === DECK_FLOOR_BLOCK) b.setType("minecraft:air");
        cleared.add(cellKey(c));
      } catch {
        // Unloaded chunk: keep the cell and clear it on a later tick.
      }
    }
    const cells = new Map(
      entry.cells
        .filter((c) => !cleared.has(cellKey(c)))
        .map((c) => [cellKey(c), c]),
    );
    for (const c of place) {
      try {
        const b = entry.dimension.getBlock(c);
        if (!b) continue;
        const ownFloor = cells.has(cellKey(c)) && b.typeId === DECK_FLOOR_BLOCK;
        if (!b.isAir && !isLightBlock(b) && !ownFloor) continue;
        b.setPermutation(
          BlockPermutation.resolve(DECK_FLOOR_BLOCK, {
            [DECK_FLOOR_HEIGHT_STATE]: c.height,
          }),
        );
        cells.set(cellKey(c), c);
      } catch {
        // Unloaded chunk or outside the world: retry placement on a later tick.
      }
    }
    entry.cells = [...cells.values()];
  }
}
