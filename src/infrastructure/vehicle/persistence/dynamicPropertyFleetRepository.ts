// Keeps the fleet in a world dynamic property, so the order of the vehicles
// survives /reload and server restarts (ADR 0038).
import { world } from "@minecraft/server";
import type { Logger } from "../../../application/vehicle/ports";
import { Fleet, type FleetLimitOf } from "../../../domain/vehicle/fleet";
import type { FleetRepository } from "../../../domain/vehicle/fleetRepository";
import { FLEET_PROPERTY } from "../bedrock/identifiers";
import { parseFleetState, serializeFleetState } from "./fleetJson";

export class DynamicPropertyFleetRepository implements FleetRepository {
  constructor(
    private readonly log: Logger,
    private readonly limitOf: FleetLimitOf,
  ) {}

  load(): Fleet {
    const raw = world.getDynamicProperty(FLEET_PROPERTY);
    if (raw === undefined) return Fleet.empty(this.limitOf);
    try {
      return Fleet.restore(parseFleetState(raw), this.limitOf);
    } catch (e) {
      // Starting over forgets the order and the evicted list. Vehicles join
      // again as the oldest when they next load or the script restarts.
      this.log.warn(
        `ignored a malformed ${FLEET_PROPERTY} (${e}): ${String(raw).slice(0, 200)}`,
      );
      return Fleet.empty(this.limitOf);
    }
  }

  save(fleet: Fleet): void {
    world.setDynamicProperty(
      FLEET_PROPERTY,
      serializeFleetState(fleet.state()),
    );
  }
}
