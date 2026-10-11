// Light blocks in front of vehicles with their headlights on (ADR 0020).
import type { Block, Dimension, Entity } from "@minecraft/server";
import {
  type Cell,
  cellKey,
  relight,
} from "../../../domain/vehicle/headlights";
import { LIGHT_BLOCK, LIT_CELLS_PROPERTY } from "./identifiers";

/** Light blocks are not solid and a player cannot see them, so the scripts treat them as air. */
export const isLightBlock = (b: Block): boolean =>
  b.typeId.startsWith("minecraft:light_block");

interface Lit {
  dimension: Dimension;
  cells: Cell[];
}

function isCell(v: unknown): v is Cell {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return [c.x, c.y, c.z].every((n) => Number.isInteger(n));
}

// The cells a vehicle lit are saved on the entity, so a /reload or a restart
// can still clear them.
function savedCells(car: Entity): Cell[] {
  const raw = car.getDynamicProperty(LIT_CELLS_PROPERTY);
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isCell) : [];
  } catch {
    return [];
  }
}

export class HeadlightBlocks {
  private readonly lit = new Map<string, Lit>();

  /** `car` is undefined when the vehicle is gone; its cells are then only cleared. */
  shine(vehicleId: string, car: Entity | undefined, wanted: readonly Cell[]) {
    let entry = this.lit.get(vehicleId);
    if (!entry) {
      if (!car) return;
      entry = { dimension: car.dimension, cells: savedCells(car) };
    }
    if (car && car.dimension.id !== entry.dimension.id) {
      this.update(entry, []);
      entry = { dimension: car.dimension, cells: [] };
    }
    const before = entry.cells.map(cellKey).join(";");
    this.update(entry, car ? wanted : []);
    if (entry.cells.length > 0) this.lit.set(vehicleId, entry);
    else this.lit.delete(vehicleId);
    if (car?.isValid && entry.cells.map(cellKey).join(";") !== before) {
      car.setDynamicProperty(
        LIT_CELLS_PROPERTY,
        entry.cells.length > 0 ? JSON.stringify(entry.cells) : undefined,
      );
    }
  }

  /**
   * Clears the cells of vehicles that are gone. A vehicle removed as its chunk
   * loads may have lit cells in chunks that are not loaded yet, and nothing
   * else asks for its id again (ADR 0038).
   */
  clearGone(live: ReadonlySet<string>): void {
    for (const [id, entry] of this.lit) {
      if (live.has(id)) continue;
      this.update(entry, []);
      if (entry.cells.length === 0) this.lit.delete(id);
    }
  }

  private update(entry: Lit, wanted: readonly Cell[]): void {
    const { clear, light } = relight(entry.cells, wanted);
    const cleared = new Set<string>();
    for (const c of clear) {
      try {
        const b = entry.dimension.getBlock(c);
        // getBlock may also return undefined for an unloaded chunk; keep the
        // cell then too.
        if (!b) continue;
        // A player may have built over the light since; leave that block alone.
        if (isLightBlock(b)) b.setType("minecraft:air");
        cleared.add(cellKey(c));
      } catch {
        // Unloaded chunk: keep the cell and clear it on a later tick.
      }
    }
    const cells = entry.cells.filter((c) => !cleared.has(cellKey(c)));
    for (const c of light) {
      try {
        const b = entry.dimension.getBlock(c);
        if (!b?.isAir) continue;
        b.setType(LIGHT_BLOCK);
        cells.push(c);
      } catch {
        // Unloaded chunk or outside the world: no light there this tick.
      }
    }
    entry.cells = cells;
  }
}
