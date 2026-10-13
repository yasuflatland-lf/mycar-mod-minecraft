// Persistent auxiliary seats for held vehicles (ADR 0063).
import { type Entity, type Player, world } from "@minecraft/server";
import type { Vec3 } from "../../../domain/shared/vec";
import { DECK_SEAT_REACH } from "../../../domain/vehicle/kinds/index";
import {
  DECK_SEAT_OF_PROPERTY,
  DECK_SEAT_TYPE,
  DECK_SEATS_PROPERTY,
  isVehicleEntity,
  PLAYER_TYPE,
} from "./identifiers";

// Under a pixel (1/16 block): a seat this close to its spot is left alone, so a
// seated player is not teleported every tick for drift nobody can see.
const TELEPORT_TOLERANCE = 0.05;
// A deck seat stays within TELEPORT_TOLERANCE of its spot, at most
// DECK_SEAT_REACH from its vehicle; the margin finds a loaded owner even
// when the seat loads a tick before the owner has been moved back to its
// hold pose.
const ORPHAN_MARGIN = 5;
const ORPHAN_RADIUS = DECK_SEAT_REACH + ORPHAN_MARGIN;

function savedIds(car: Entity): (string | null)[] {
  const raw = car.getDynamicProperty(DECK_SEATS_PROPERTY);
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((id) => (typeof id === "string" ? id : null))
      : [];
  } catch {
    return [];
  }
}

function seatEntity(
  id: string | null | undefined,
  vehicleId: string,
): Entity | undefined {
  const seat = id ? world.getEntity(id) : undefined;
  return seat?.isValid &&
    seat.typeId === DECK_SEAT_TYPE &&
    seat.getDynamicProperty(DECK_SEAT_OF_PROPERTY) === vehicleId
    ? seat
    : undefined;
}

function seatedPlayer(seat: Entity | undefined): Player | undefined {
  return seat
    ?.getComponent("minecraft:rideable")
    ?.getRiders()
    .find((rider): rider is Player => rider.typeId === PLAYER_TYPE);
}

export function removeOrphanDeckSeat(seat: Entity): void {
  if (!seat.isValid || seat.typeId !== DECK_SEAT_TYPE) return;
  const owner = seat.getDynamicProperty(DECK_SEAT_OF_PROPERTY);
  const found = seat.dimension
    .getEntities({ location: seat.location, maxDistance: ORPHAN_RADIUS })
    .some((entity) => entity.id === owner && isVehicleEntity(entity.typeId));
  if (!found) seat.remove();
}

export class DeckSeats {
  private readonly kept = new Map<string, (string | null)[]>();

  private ids(car: Entity): (string | null)[] {
    const ids = this.kept.get(car.id) ?? savedIds(car);
    this.kept.set(car.id, ids);
    return ids;
  }

  keep(
    vehicleId: string,
    car: Entity | undefined,
    positions: readonly (Vec3 | undefined)[],
    yaw: number,
  ): void {
    const ids = car ? this.ids(car) : (this.kept.get(vehicleId) ?? []);
    const before = JSON.stringify(ids);
    const wanted = car ? positions : [];
    for (let index = 0; index < Math.max(ids.length, wanted.length); index++) {
      let seat = seatEntity(ids[index], vehicleId);
      const at = wanted[index];
      if (!at || !car) {
        seat?.remove();
        ids[index] = null;
        continue;
      }
      if (seat && seat.dimension.id !== car.dimension.id) {
        seat.remove();
        seat = undefined;
      }
      if (!seat) {
        seat = car.dimension.spawnEntity(DECK_SEAT_TYPE, at);
        seat.setDynamicProperty(DECK_SEAT_OF_PROPERTY, vehicleId);
        seat.setRotation({ x: 0, y: yaw });
        ids[index] = seat.id;
      } else if (
        Math.hypot(
          seat.location.x - at.x,
          seat.location.y - at.y,
          seat.location.z - at.z,
        ) > TELEPORT_TOLERANCE
      ) {
        seat.teleport(at, { rotation: { x: 0, y: yaw } });
      }
    }
    ids.length = wanted.length;
    if (ids.length > 0) this.kept.set(vehicleId, ids);
    else this.kept.delete(vehicleId);
    if (car?.isValid && JSON.stringify(ids) !== before)
      car.setDynamicProperty(
        DECK_SEATS_PROPERTY,
        ids.length > 0 ? JSON.stringify(ids) : undefined,
      );
  }

  riders(car: Entity): (Player | undefined)[] {
    return this.ids(car).map((id) => seatedPlayer(seatEntity(id, car.id)));
  }

  board(car: Entity): void {
    const rideable = car.getComponent("minecraft:rideable");
    if (!rideable) return;
    for (const id of this.ids(car)) {
      const seat = seatEntity(id, car.id);
      const seatRideable = seat?.getComponent("minecraft:rideable");
      const player = seatedPlayer(seat);
      if (!player || !seatRideable) continue;
      seatRideable.ejectRider(player);
      if (!rideable.addRider(player)) seatRideable.addRider(player);
    }
  }

  clearGone(live: ReadonlySet<string>): void {
    for (const id of this.kept.keys())
      if (!live.has(id)) this.keep(id, undefined, [], 0);
  }
}
