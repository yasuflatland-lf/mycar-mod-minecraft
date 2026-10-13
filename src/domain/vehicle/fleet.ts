// The vehicles in a world in the order they appeared, and the ones evicted to
// keep each owner and kind at its limit (ADR 0038, ADR 0066). A script cannot
// remove an entity in an unloaded chunk, so it waits until its chunk loads.
import type { VehicleKind } from "./kind";
import { SPEC } from "./spec";

export type FleetLimitOf = (kind: VehicleKind) => number;

export interface FleetEntry {
  readonly id: string;
  readonly kind: VehicleKind;
  /** Player.id of the player who placed it; undefined when summoned by command or placed before ADR 0066. */
  readonly owner?: string;
}

export interface FleetState {
  /** Oldest first. */
  readonly order: readonly FleetEntry[];
  /** Oldest eviction first. */
  readonly evicted: readonly string[];
}

export class Fleet {
  private constructor(
    private order: FleetEntry[],
    private evicted: string[],
    private readonly limitOf: FleetLimitOf,
  ) {}

  static empty(limitOf: FleetLimitOf): Fleet {
    return new Fleet([], [], limitOf);
  }

  /**
   * A stored state may come from a build with a higher limit or be edited by
   * hand, so a repeated id counts once and a tracked id is not also evicted.
   */
  static restore(state: FleetState, limitOf: FleetLimitOf): Fleet {
    const tracked = new Set<string>();
    const order: FleetEntry[] = [];
    for (const entry of state.order) {
      if (tracked.has(entry.id)) continue;
      tracked.add(entry.id);
      order.push({ ...entry });
    }
    const evicted = [...new Set(state.evicted)].filter(
      (id) => !tracked.has(id),
    );
    const fleet = new Fleet(order, evicted, limitOf);
    fleet.trim();
    return fleet;
  }

  state(): FleetState {
    return {
      order: this.order.map((entry) => ({ ...entry })),
      evicted: [...this.evicted],
    };
  }

  has(id: string): boolean {
    return this.order.some((entry) => entry.id === id);
  }

  isEvicted(id: string): boolean {
    return this.evicted.includes(id);
  }

  knows(id: string): boolean {
    return this.has(id) || this.isEvicted(id);
  }

  /**
   * Adds a vehicle as the newest one. A vehicle already known keeps its place,
   * so a repeated event for the same vehicle changes nothing.
   */
  admit(entry: FleetEntry): void {
    if (this.knows(entry.id)) return;
    this.order.push({ ...entry });
    this.trim();
  }

  /**
   * Adds a vehicle that was already in the world when the fleet first saw it,
   * so it goes before every vehicle the fleet watched appear.
   */
  admitAsOldest(entry: FleetEntry): void {
    if (this.knows(entry.id)) return;
    this.order.unshift({ ...entry });
    this.trim();
  }

  /** Stops tracking a vehicle that is gone. */
  forget(id: string): void {
    this.order = this.order.filter((entry) => entry.id !== id);
    this.evicted = this.evicted.filter((e) => e !== id);
  }

  private trim(): void {
    const groups = new Map<string, FleetEntry[]>();
    for (const entry of this.order) {
      const key =
        entry.owner === undefined ? "" : `${entry.owner}\u0000${entry.kind}`;
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }
    const removed = new Set<string>();
    for (const group of groups.values()) {
      const first = group[0];
      if (!first) continue;
      const limit =
        first.owner === undefined
          ? SPEC.maxUnownedVehicles
          : this.limitOf(first.kind);
      const excess = group.length - limit;
      if (excess <= 0) continue;
      for (const entry of group.slice(0, excess)) {
        removed.add(entry.id);
        this.evicted.push(entry.id);
      }
    }
    this.order = this.order.filter((entry) => !removed.has(entry.id));
    this.evicted = this.evicted.slice(-SPEC.maxEvicted);
  }
}
