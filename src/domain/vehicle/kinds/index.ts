// The only way to build a vehicle: every caller names the kind, so none falls back to SUV values (ADR 0055).
import type { Drive, RestoredValues } from "../drive";
import type { EntityContract } from "../entityContract";
import type { FleetLimitOf } from "../fleet";
import type { VehicleKind } from "../kind";
import type { VehicleProfile } from "../profile";
import { ramQueryRadius } from "../ramQuery";
import { type RiderView, Vehicle } from "../vehicle";
import { BoatDrive } from "./sportsboat/drive";
import { SPORTSBOAT_ENTITY } from "./sportsboat/entity";
import { SPORTSBOAT_PROFILE } from "./sportsboat/profile";
import { SuvDrive } from "./suv/drive";
import { SUV_ENTITY } from "./suv/entity";
import { SUV_PROFILE } from "./suv/profile";

export type { RestoredValues };

interface KindDefinition {
  profile: VehicleProfile;
  entity: EntityContract;
  createDrive(yaw: number, restored: RestoredValues): Drive;
}

// Frozen, rows included, so a write cannot swap a kind's profile or drive for
// every vehicle of that kind.
export const KINDS: Readonly<Record<VehicleKind, Readonly<KindDefinition>>> =
  Object.freeze({
    suv: Object.freeze<KindDefinition>({
      profile: SUV_PROFILE,
      entity: SUV_ENTITY,
      createDrive: (yaw, restored) => new SuvDrive(yaw, restored),
    }),
    sportsboat: Object.freeze<KindDefinition>({
      profile: SPORTSBOAT_PROFILE,
      entity: SPORTSBOAT_ENTITY,
      createDrive: (yaw, restored) => new BoatDrive(yaw, restored),
    }),
  });

export const fleetLimitOf: FleetLimitOf = (kind) =>
  KINDS[kind].profile.fleetLimit;

export const RAM_QUERY_RADIUS = ramQueryRadius(
  Object.values(KINDS).map(({ profile }) => profile),
);

export function createVehicle(
  kind: VehicleKind,
  id: string,
  yaw: number,
): Vehicle {
  return new Vehicle(id, profileOf(kind), KINDS[kind].createDrive(yaw, {}));
}

/**
 * Rebuilds a vehicle whose aggregate was lost; `restored` holds the entity
 * properties read back (only `form` for now). The form comes from the entity,
 * so a vehicle in the air keeps flying (ADR 0021).
 */
export function rebuildVehicle(
  kind: VehicleKind,
  id: string,
  yaw: number,
  riders: readonly RiderView[],
  restored: RestoredValues,
): Vehicle {
  const vehicle = new Vehicle(
    id,
    profileOf(kind),
    KINDS[kind].createDrive(yaw, restored),
  );
  vehicle.seatRiders(riders, yaw);
  return vehicle;
}

export function profileOf(kind: VehicleKind): VehicleProfile {
  return KINDS[kind].profile;
}

export function entityContractOf(kind: VehicleKind): EntityContract {
  return KINDS[kind].entity;
}
