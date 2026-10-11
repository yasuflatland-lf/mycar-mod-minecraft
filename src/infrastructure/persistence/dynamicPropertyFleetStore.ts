// Keeps the fleet in a world dynamic property, so the order of the vehicles
// survives /reload and server restarts (ADR 0038).
import { world } from "@minecraft/server";
import type { FleetStore, Logger } from "../../application/ports";
import { Fleet, type FleetState } from "../../domain/vehicle/fleet";
import { FLEET_PROPERTY } from "../bedrock/identifiers";

const isIdList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((id) => typeof id === "string");

function parse(raw: string): FleetState | undefined {
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return undefined;
    const { order, evicted } = v as Record<string, unknown>;
    return isIdList(order) && isIdList(evicted)
      ? { order, evicted }
      : undefined;
  } catch {
    return undefined;
  }
}

export class DynamicPropertyFleetStore implements FleetStore {
  constructor(private readonly log: Logger) {}

  load(): Fleet {
    const raw = world.getDynamicProperty(FLEET_PROPERTY);
    if (raw === undefined) return Fleet.empty();
    const state = typeof raw === "string" ? parse(raw) : undefined;
    if (state) return Fleet.restore(state);
    // Starting over only forgets the order; the vehicles are admitted again as they are seen.
    this.log.warn(`[mycar] ignored a malformed ${FLEET_PROPERTY}`);
    return Fleet.empty();
  }

  save(fleet: Fleet): void {
    world.setDynamicProperty(FLEET_PROPERTY, JSON.stringify(fleet.state()));
  }
}
