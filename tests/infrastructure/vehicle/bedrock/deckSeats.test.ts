import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { Vec3 } from "../../../../src/domain/shared/vec";
import { DECK_SEAT_REACH } from "../../../../src/domain/vehicle/kinds/index";
import {
  DeckSeats,
  removeOrphanDeckSeat,
} from "../../../../src/infrastructure/vehicle/bedrock/deckSeats";
import {
  DECK_SEAT_OF_PROPERTY,
  DECK_SEAT_TYPE,
  DECK_SEATS_PROPERTY,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

function fixture() {
  const entities = new Map<string, ReturnType<typeof entity>>();
  const boarded: string[] = [];
  const dimension = {
    id: "overworld",
    spawnEntity: vi.fn((type: string, at: Vec3) =>
      entity(`seat${entities.size}`, type, at),
    ),
    getEntities: vi.fn(() => [...entities.values()].filter((e) => e.isValid)),
  };
  function entity(id: string, typeId: string, at = { x: 0, y: 0, z: 0 }) {
    const saved = new Map<string, unknown>();
    const riders: { id: string; typeId: string }[] = [];
    const rideable = {
      getRiders: () => riders,
      ejectRider: vi.fn((player: (typeof riders)[number]) => {
        riders.splice(riders.indexOf(player), 1);
      }),
      addRider: vi.fn((player: (typeof riders)[number]) => {
        boarded.push(player.id);
        riders.push(player);
        return true;
      }),
    };
    const e = {
      id,
      typeId,
      location: at,
      dimension: dimension as unknown as Entity["dimension"],
      isValid: true,
      saved,
      riders,
      rideable,
      getDynamicProperty: (key: string) => saved.get(key),
      setDynamicProperty: (key: string, value: unknown) =>
        saved.set(key, value),
      getComponent: () => rideable,
      setRotation: vi.fn(),
      teleport: vi.fn((at: Vec3) => {
        e.location = at;
      }),
      remove: vi.fn(() => {
        e.isValid = false;
      }),
    };
    entities.set(id, e);
    return e;
  }
  const boat = entity("boat", "yasu_ride:sportsboat");
  game.getEntity.mockImplementation((id: string) => entities.get(id));
  return { boat, car: boat as unknown as Entity, entities, dimension, boarded };
}

const point = fc.record({
  x: fc.integer({ min: -10, max: 10 }),
  y: fc.integer({ min: -10, max: 10 }),
  z: fc.integer({ min: -10, max: 10 }),
});

it("restores seat ownership, replaces missing seats, moves drifted seats and clears on removal", () => {
  fc.assert(
    fc.property(
      fc.array(point, { minLength: 4, maxLength: 4 }),
      fc.integer({ min: -180, max: 180 }),
      (positions, yaw) => {
        const f = fixture();
        new DeckSeats().keep(f.car.id, f.car, positions, yaw);
        const ids: string[] = JSON.parse(
          String(f.boat.saved.get(DECK_SEATS_PROPERTY)),
        );
        expect(ids).toHaveLength(4);
        ids.forEach((id, index) => {
          const seat = f.entities.get(id);
          expect(seat?.location).toEqual(positions[index]);
          expect(seat?.saved.get(DECK_SEAT_OF_PROPERTY)).toBe(f.car.id);
          expect(seat?.setRotation).toHaveBeenCalledWith({ x: 0, y: yaw });
        });
        const reloaded = new DeckSeats();
        reloaded.keep(f.car.id, f.car, positions, yaw);
        expect(f.dimension.spawnEntity).toHaveBeenCalledTimes(4);
        for (const id of ids)
          expect(f.entities.get(id)?.teleport).not.toHaveBeenCalled();
        f.entities.get(ids[0] ?? "")?.remove();
        const shifted = positions.map((p) => ({ ...p, x: p.x + 1 }));
        reloaded.keep(f.car.id, f.car, shifted, yaw);
        expect(f.dimension.spawnEntity).toHaveBeenCalledTimes(5);
        reloaded.clearGone(new Set([f.car.id]));
        expect(
          f.dimension.getEntities().filter((e) => e.typeId === DECK_SEAT_TYPE),
        ).toHaveLength(4);
        reloaded.keep(f.car.id, f.car, [], yaw);
        expect(f.boat.saved.get(DECK_SEATS_PROPERTY)).toBeUndefined();
        expect(
          f.dimension.getEntities().filter((e) => e.typeId === DECK_SEAT_TYPE),
        ).toEqual([]);
        reloaded.keep(f.car.id, f.car, positions, yaw);
        reloaded.clearGone(new Set());
        expect(
          f.dimension.getEntities().filter((e) => e.typeId === DECK_SEAT_TYPE),
        ).toEqual([]);
      },
    ),
  );
});

it("boards occupied deck seats in index order across gaps", () => {
  fc.assert(
    fc.property(fc.subarray([0, 1, 2, 3]), (occupied) => {
      const f = fixture();
      const seats = new DeckSeats();
      seats.keep(
        f.car.id,
        f.car,
        Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0 })),
        0,
      );
      const ids: string[] = JSON.parse(
        String(f.boat.saved.get(DECK_SEATS_PROPERTY)),
      );
      ids.forEach((id, index) => {
        if (occupied.includes(index))
          f.entities
            .get(id)
            ?.riders.push({ id: `player${index}`, typeId: "minecraft:player" });
      });
      expect(seats.riders(f.car).map((p) => p?.id)).toEqual(
        [0, 1, 2, 3].map((i) =>
          occupied.includes(i) ? `player${i}` : undefined,
        ),
      );
      seats.board(f.car);
      expect(f.boarded).toEqual(occupied.map((i) => `player${i}`));
      expect(seats.riders(f.car)).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    }),
  );
});

it("removes a loaded orphan and preserves a seat with a nearby loaded owner", () => {
  const f = fixture();
  new DeckSeats().keep(f.car.id, f.car, [{ x: 0, y: 0, z: 0 }], 0);
  const seat = f.dimension
    .getEntities()
    .find((e) => e.typeId === DECK_SEAT_TYPE);
  if (!seat) throw new Error("missing seat");
  removeOrphanDeckSeat(seat as unknown as Entity);
  expect(seat.remove).not.toHaveBeenCalled();
  expect(f.dimension.getEntities).toHaveBeenCalledWith({
    location: seat.location,
    maxDistance: DECK_SEAT_REACH + 5,
  });
  f.boat.remove();
  removeOrphanDeckSeat(seat as unknown as Entity);
  expect(seat.remove).toHaveBeenCalledOnce();
});

it("removes only the deck seats whose boat seat is taken and keeps the others in place", () => {
  fc.assert(
    fc.property(
      fc.array(point, { minLength: 4, maxLength: 4 }),
      fc.subarray([0, 1, 2, 3]),
      (positions, taken) => {
        const f = fixture();
        const seats = new DeckSeats();
        seats.keep(f.car.id, f.car, positions, 0);
        const ids: string[] = JSON.parse(
          String(f.boat.saved.get(DECK_SEATS_PROPERTY)),
        );
        seats.keep(
          f.car.id,
          f.car,
          positions.map((at, seat) => (taken.includes(seat) ? undefined : at)),
          0,
        );
        expect(
          JSON.parse(String(f.boat.saved.get(DECK_SEATS_PROPERTY))),
        ).toEqual(ids.map((id, seat) => (taken.includes(seat) ? null : id)));
        ids.forEach((id, seat) => {
          expect(f.entities.get(id)?.isValid).toBe(!taken.includes(seat));
        });
        expect(f.dimension.spawnEntity).toHaveBeenCalledTimes(4);
      },
    ),
  );
});

it("treats a corrupt saved seat list as no seats and drops entries that are not ids", () => {
  for (const [raw, expected] of [
    ["{", []],
    ['{"seat":"a"}', []],
    [JSON.stringify(["missing", 3, null]), [undefined, undefined, undefined]],
  ] as const) {
    const f = fixture();
    f.boat.saved.set(DECK_SEATS_PROPERTY, raw);
    expect(new DeckSeats().riders(f.car)).toEqual(expected);
  }
});

it("leaves a non-seat or removed entity alone when checking for orphans", () => {
  const f = fixture();
  removeOrphanDeckSeat(f.car);
  const seat = f.dimension.spawnEntity(DECK_SEAT_TYPE, { x: 0, y: 0, z: 0 });
  seat.isValid = false;
  removeOrphanDeckSeat(seat as unknown as Entity);
  expect(f.boat.remove).not.toHaveBeenCalled();
  expect(seat.remove).not.toHaveBeenCalled();
  expect(f.dimension.getEntities).not.toHaveBeenCalled();
});

it("ignores a vehicle it never kept seats for once the vehicle is gone", () => {
  const f = fixture();
  new DeckSeats().keep("unknown", undefined, [{ x: 0, y: 0, z: 0 }], 0);
  expect(f.dimension.spawnEntity).not.toHaveBeenCalled();
});

it("replaces a seat left in another dimension by one beside the boat", () => {
  const f = fixture();
  const seats = new DeckSeats();
  const at = [{ x: 1, y: 2, z: 3 }];
  seats.keep(f.car.id, f.car, at, 0);
  const [first] = JSON.parse(String(f.boat.saved.get(DECK_SEATS_PROPERTY)));
  const old = f.entities.get(first);
  if (!old) throw new Error("missing seat");
  old.dimension = { id: "nether" } as unknown as Entity["dimension"];
  seats.keep(f.car.id, f.car, at, 0);
  expect(old.remove).toHaveBeenCalledOnce();
  const [second] = JSON.parse(String(f.boat.saved.get(DECK_SEATS_PROPERTY)));
  expect(second).not.toBe(first);
  expect(f.entities.get(second)?.location).toEqual(at[0]);
});

it("boards nobody without a rideable boat, and keeps a refused rider on the deck seat", () => {
  const f = fixture();
  const seats = new DeckSeats();
  seats.keep(f.car.id, f.car, [{ x: 0, y: 0, z: 0 }], 0);
  const [id] = JSON.parse(String(f.boat.saved.get(DECK_SEATS_PROPERTY)));
  const seat = f.entities.get(id);
  if (!seat) throw new Error("missing seat");
  const player = { id: "player", typeId: "minecraft:player" };
  seat.riders.push(player);
  seats.board({ ...f.car, getComponent: () => undefined } as unknown as Entity);
  expect(seat.rideable.ejectRider).not.toHaveBeenCalled();
  f.boat.rideable.addRider.mockReturnValueOnce(false);
  seats.board(f.car);
  expect(seat.rideable.ejectRider).toHaveBeenCalledWith(player);
  expect(seats.riders(f.car).map((p) => p?.id)).toEqual(["player"]);
});
