import { PAINTS, type Paint } from "../../domain/vehicle/paint";

export const VEHICLE_TYPE = "mycar:suv";
export const ITEM_TYPE = "mycar:suv_item";
export const PLAYER_TYPE = "minecraft:player";
/** Dynamic property on a player, set after they have been given their starter vehicle item (ADR 0023). */
export const STARTER_RECEIVED_PROPERTY = "mycar:starter_received";
/** Item a rider uses to switch the headlights (ADR 0020). */
export const HEADLIGHT_SWITCH_TYPE = "mycar:headlight_switch";
/** Entity property in packs/mycar_bp/entities/suv.json; the render controller makes the lamps glow by it. */
export const HEADLIGHTS_PROPERTY = "mycar:headlights";
/** Dynamic property on a vehicle holding the cells it put light blocks in. */
export const LIT_CELLS_PROPERTY = "mycar:lit_cells";
export const LIGHT_BLOCK = "minecraft:light_block_15";
/**
 * Test input messages have the form "<vehicleId>,<moveX>,<moveY>,<jump>"
 * (jump is 0 / 1). "<vehicleId>,clear" clears the input.
 */
export const TEST_INPUT_EVENT = "mycar:test_input";
/** Client-synced flight mode. The script reads it back after /reload, and the Resource Pack draws the flight visuals from it (ADR 0021). */
export const FLIGHT_PROPERTY = "mycar:flight";
/** Vanilla camera preset that views the player from behind, as F5 does (ADR 0028). */
export const THIRD_PERSON_CAMERA = "minecraft:third_person";
/** Client-synced bank angle in degrees; the Resource Pack rolls the model by it (ADR 0026). */
export const BANK_PROPERTY = "mycar:bank";
/** Client-synced landing gear; the Resource Pack unfolds the wheels by it (ADR 0033). */
export const GEAR_DOWN_PROPERTY = "mycar:gear_down";
export const HOVER_EVENT = "mycar:hover";
export const LAND_EVENT = "mycar:land";

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
/** Entity event in packs/mycar_bp/entities/suv.json that sets the variant for a paint. */
export const paintEvent = (paint: Paint): string => `mycar:paint_${paint}`;
