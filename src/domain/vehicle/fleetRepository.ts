import type { Fleet } from "./fleet";

/** Keeps the fleet across script reloads and server restarts (ADR 0038). */
export interface FleetRepository {
  load(): Fleet;
  save(fleet: Fleet): void;
}
