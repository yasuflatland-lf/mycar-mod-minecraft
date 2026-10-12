// Reads back the fleet stored as JSON in a dynamic property (ADR 0038).
import type { FleetState } from "../../../domain/vehicle/fleet";

function isIdList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((id) => typeof id === "string");
}

/** Throws with the reason when `raw` is not a stored fleet. */
export function parseFleetState(raw: unknown): FleetState {
  if (typeof raw !== "string") throw new Error(`not a string: ${typeof raw}`);
  const v: unknown = JSON.parse(raw);
  if (typeof v !== "object" || v === null) throw new Error("not an object");
  const { order, evicted } = v as Record<string, unknown>;
  if (!isIdList(order) || !isIdList(evicted)) {
    throw new Error("order or evicted is not a list of ids");
  }
  return { order, evicted };
}
