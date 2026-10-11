// The vehicles in a world in the order they appeared, and the ones evicted to
// keep their number at the limit (ADR 0038). A script cannot remove an entity in
// an unloaded chunk, so an evicted vehicle waits here until its chunk loads.
import { SPEC } from "./spec";

export interface FleetState {
  /** Oldest first. */
  order: string[];
  evicted: string[];
}

export class Fleet {
  private constructor(
    private order: string[],
    private evicted: string[],
  ) {}

  static empty(): Fleet {
    return new Fleet([], []);
  }

  static restore(state: FleetState): Fleet {
    const fleet = new Fleet([...state.order], [...state.evicted]);
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

  /** Adds a vehicle as the newest one. Does nothing for a vehicle already tracked or evicted. */
  admit(id: string): void {
    if (this.has(id) || this.isEvicted(id)) return;
    this.order.push(id);
    this.trim();
  }

  /**
   * Adds a vehicle that was already in the world when the fleet first saw it,
   * so it goes before every vehicle the fleet watched appear.
   */
  admitAsOldest(id: string): void {
    if (this.has(id) || this.isEvicted(id)) return;
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
