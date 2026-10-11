import { PAINTS, type Paint } from "../../../domain/vehicle/paint";
import { id, NAMESPACE } from "../../shared/identifiers";

export const VEHICLE_TYPE = id("suv");
export const ITEM_TYPE = id("suv_item");
export const PLAYER_TYPE = "minecraft:player";
/** Dynamic property on a player, set after they have been given their starter vehicle item (ADR 0023). */
export const STARTER_RECEIVED_PROPERTY = id("starter_received");
/** World dynamic property holding the fleet as JSON (ADR 0038). */
export const FLEET_PROPERTY = id("fleet");
/** Item a rider uses to switch the headlights (ADR 0020). */
export const HEADLIGHT_SWITCH_TYPE = id("headlight_switch");
/** Entity property in packs/yasuflatland_ride_bp/entities/yasuflatland_ride/suv.json; the render controller makes the lamps glow by it. */
export const HEADLIGHTS_PROPERTY = id("headlights");
/** Dynamic property on a vehicle holding the cells it put light blocks in. */
export const LIT_CELLS_PROPERTY = id("lit_cells");
/** Resource Pack animation that swings a door bone (ADR 0009) open and shut. */
export const doorAnimation = (door: string): string =>
  `animation.${NAMESPACE}.suv.${door}`;
export const LIGHT_BLOCK = "minecraft:light_block_15";
/**
 * Test input messages have the form "<vehicleId>,<moveX>,<moveY>,<jump>"
 * (jump is 0 / 1). "<vehicleId>,clear" clears the input.
 */
export const TEST_INPUT_EVENT = id("test_input");
/** Client-synced vehicle form. The script reads it back after /reload, and the Resource Pack draws each form from it (ADR 0021, 0039). */
export const FORM_PROPERTY = id("form");
/** Vanilla camera preset that views the player from behind, as F5 does (ADR 0028). */
export const THIRD_PERSON_CAMERA = "minecraft:third_person";
/** Client-synced bank angle in degrees; the Resource Pack rolls the model by it (ADR 0026). */
export const BANK_PROPERTY = id("bank");
/** Client-synced landing gear; the Resource Pack unfolds the wheels by it (ADR 0033). */
export const GEAR_DOWN_PROPERTY = id("gear_down");
export const GRAVITY_OFF_EVENT = id("gravity_off");
export const GRAVITY_ON_EVENT = id("gravity_on");

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
/** Entity event in packs/yasuflatland_ride_bp/entities/yasuflatland_ride/suv.json that sets the variant for a paint. */
export const paintEvent = (paint: Paint): string => id(`paint_${paint}`);
