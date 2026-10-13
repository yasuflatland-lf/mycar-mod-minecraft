import { VEHICLE_KINDS, type VehicleKind } from "../../../domain/vehicle/kind";
import { PAINTS, type Paint } from "../../../domain/vehicle/paint";
import { id, NAMESPACE } from "../../shared/identifiers";

/**
 * Every ENTITY_TYPE entity must list this family in minecraft:type_family.
 * loadedVehicles and loadedVehicleIds query entities by this family and then
 * keep the known kinds, so an entity without it is never driven or counted.
 */
export const VEHICLE_FAMILY = "yasu_ride_vehicle";
export const ENTITY_TYPE: Readonly<Record<VehicleKind, string>> = {
  suv: id("suv"),
  sportsboat: id("sportsboat"),
};
export const ITEM_TYPE: Readonly<Record<VehicleKind, string>> = {
  suv: id("suv_item"),
  sportsboat: id("sportsboat_item"),
};
export function kindOfEntity(
  typeId: string | undefined,
): VehicleKind | undefined {
  return VEHICLE_KINDS.find((kind) => ENTITY_TYPE[kind] === typeId);
}
export function isVehicleEntity(typeId: string | undefined): boolean {
  return kindOfEntity(typeId) !== undefined;
}
export function kindOfItem(
  typeId: string | undefined,
): VehicleKind | undefined {
  return VEHICLE_KINDS.find((kind) => ITEM_TYPE[kind] === typeId);
}
export const PLAYER_TYPE = "minecraft:player";
/** Dynamic property on a player, set after they have been given their starter vehicle item (ADR 0023). */
export const STARTER_RECEIVED_PROPERTY = id("starter_received");
/** World dynamic property holding the fleet as JSON (ADR 0038). */
export const FLEET_PROPERTY = id("fleet");
/** Entity dynamic property on a vehicle placed from its item: the placing player's id (ADR 0066). */
export const OWNER_PROPERTY = id("owner");
/** Item a rider uses to switch the headlights (ADR 0020). */
export const HEADLIGHT_SWITCH_TYPE = id("headlight_switch");
/** Entity property in packs/yasu_ride_bp/entities/yasu_ride/suv.se.json; the render controller makes the lamps glow by it. */
export const HEADLIGHTS_PROPERTY = id("headlights");
/** Dynamic property on a vehicle holding the cells it put light blocks in. */
export const LIT_CELLS_PROPERTY = id("lit_cells");
export const entityPropertyId = (name: string): string => id(name);
export const entityEventId = (name: string): string => id(name);
export const entityAnimationId = (entityTypeId: string, name: string): string =>
  `animation.${NAMESPACE}.${entityTypeId.slice(NAMESPACE.length + 1)}.${name}`;
/** Invisible collision floor for held vehicles (ADR 0063). */
export const DECK_FLOOR_BLOCK = id("deck_floor");
/** Collision height in pixels, matching the floor block permutations. */
export const DECK_FLOOR_HEIGHT_STATE = id("height");
/** Dynamic property on a vehicle holding its laid floor cells as JSON (ADR 0063). */
export const DECK_CELLS_PROPERTY = id("deck_cells");
/** Auxiliary seat entity spawned on a held vehicle (ADR 0063). */
export const DECK_SEAT_TYPE = id("deck_seat");
/** Dynamic property on a vehicle holding its deck seat entity ids as JSON. */
export const DECK_SEATS_PROPERTY = id("deck_seats");
/** Dynamic property on a deck seat holding the id of its vehicle. */
export const DECK_SEAT_OF_PROPERTY = id("deck_seat_of");
export const LIGHT_BLOCK = "minecraft:light_block_15";
/**
 * Test input messages have the form "<vehicleId>,<moveX>,<moveY>,<jump>"
 * (jump is 0 / 1). "<vehicleId>,clear" clears the input.
 */
export const TEST_INPUT_EVENT = id("test_input");
/** Vanilla camera preset that views the player from behind, as F5 does (ADR 0028). */
export const THIRD_PERSON_CAMERA = "minecraft:third_person";

/** The vanilla dye that repaints a vehicle with a paint (ADR 0031). Brown dye turns it back to khaki. */
export function dyeOf(paint: Paint): string {
  const color = paint === "khaki" ? "brown" : paint;
  return `minecraft:${color}_dye`;
}
export const PAINT_BY_DYE: Readonly<Record<string, Paint>> = Object.fromEntries(
  PAINTS.map((paint) => [dyeOf(paint), paint]),
);
/** minecraft:variant value for each paint. The render controller picks the texture by this index. */
export const PAINT_VARIANT: Readonly<Record<Paint, number>> =
  Object.fromEntries(PAINTS.map((paint, i) => [paint, i])) as Record<
    Paint,
    number
  >;
/** Entity event in packs/yasu_ride_bp/entities/yasu_ride/suv.se.json that sets the variant for a paint. */
export const paintEvent = (paint: Paint): string => id(`paint_${paint}`);
