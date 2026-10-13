// Reads and writes the fleet stored as JSON in a dynamic property (ADR 0038, ADR 0066).
import type { FleetEntry, FleetState } from "../../../domain/vehicle/fleet";
import { isVehicleKind } from "../../../domain/vehicle/kind";

// Version 2 carries kind and owner; unversioned saves contain only ids (ADR 0066).
const FLEET_VERSION = 2;

function isIdList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((id) => typeof id === "string");
}

function parseEntry(value: unknown): FleetEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("order entry is not an object");
  const { id, kind, owner } = value as Record<string, unknown>;
  if (typeof id !== "string") throw new Error("order entry id is not a string");
  if (!isVehicleKind(kind)) throw new Error("order entry kind is unknown");
  if (owner === undefined) return { id, kind };
  if (typeof owner !== "string")
    throw new Error("order entry owner is not a string");
  return { id, kind, owner };
}

/** Throws with the reason when `raw` is not a stored fleet. */
export function parseFleetState(raw: unknown): FleetState {
  if (typeof raw !== "string") throw new Error(`not a string: ${typeof raw}`);
  const v: unknown = JSON.parse(raw);
  if (typeof v !== "object" || v === null || Array.isArray(v))
    throw new Error("not an object");
  const { version, order, evicted } = v as Record<string, unknown>;
  if (version === FLEET_VERSION) {
    if (!Array.isArray(order))
      throw new Error("order is not a list of entries");
    if (!isIdList(evicted)) throw new Error("evicted is not a list of ids");
    return { order: order.map(parseEntry), evicted };
  }
  if ("version" in v) throw new Error("unsupported fleet version");
  if (!isIdList(order) || !isIdList(evicted))
    throw new Error("order or evicted is not a list of ids");
  // Found vehicles rejoin as oldest with their real kind and owner (ADR 0066).
  return { order: [], evicted };
}

export function serializeFleetState(state: FleetState): string {
  return JSON.stringify({
    version: FLEET_VERSION,
    order: state.order,
    evicted: state.evicted,
  });
}
