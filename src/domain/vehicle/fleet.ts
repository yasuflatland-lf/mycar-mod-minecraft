// The vehicles in a world in the order they appeared, and the ones evicted to
// keep their number at the limit (ADR 0038). A script cannot remove an entity in
// an unloaded chunk, so an evicted vehicle waits here until its chunk loads.
import { SPEC } from "./spec";

export interface FleetState {
  /** Oldest first. */
  readonly order: readonly string[];
  /** Oldest eviction first. */
  readonly evicted: readonly string[];
}

export class Fleet {
  private constructor(
    private order: string[],
    private evicted: string[],
  ) {}

  static empty(): Fleet {
    return new Fleet([], []);
  }

  /**
   * A stored state may come from a build with a higher limit or be edited by
   * hand, so a repeated id counts once and a tracked id is not also evicted.
   */
  static restore(state: FleetState): Fleet {
    const order = [...new Set(state.order)];
    const tracked = new Set(order);
    const evicted = [...new Set(state.evicted)].filter(
      (id) => !tracked.has(id),
    );
    const fleet = new Fleet(order, evicted);
    fleet.trim();
    return fleet;
  }

  state(): FleetState {
    return { order: [...this.order], evicted: [...this.evicted] };
  }

  has(id: string): boolean {
    return this.order.includes(id);
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
  admit(id: string): void {
    if (this.knows(id)) return;
    this.order.push(id);
    this.trim();
  }

  /**
   * Adds a vehicle that was already in the world when the fleet first saw it,
   * so it goes before every vehicle the fleet watched appear.
   */
  admitAsOldest(id: string): void {
    if (this.knows(id)) return;
    this.order.unshift(id);
    this.trim();
  }

  /** Stops tracking a vehicle that is gone. */
  forget(id: string): void {
    this.order = this.order.filter((o) => o !== id);
    this.evicted = this.evicted.filter((e) => e !== id);
  }

  private trim(): void {
    const excess = this.order.length - SPEC.maxVehicles;
    if (excess > 0) this.evicted.push(...this.order.splice(0, excess));
    this.evicted = this.evicted.slice(-SPEC.maxEvicted);
  }
}
