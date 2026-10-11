import type { Paint } from "../../domain/vehicle/paint";

export const VEHICLE_TYPE = "mycar:suv";
export const ITEM_TYPE = "mycar:suv_item";
export const PLAYER_TYPE = "minecraft:player";
/** Item a rider uses to switch the headlights (ADR 0020). */
export const HEADLIGHT_SWITCH_TYPE = "mycar:headlight_switch";
/** Entity property in packs/mycar_bp/entities/suv.json; the render controller makes the lamps glow by it. */
export const HEADLIGHTS_PROPERTY = "mycar:headlights";
/** Dynamic property on a vehicle holding the cells it put light blocks in. */
export const LIT_CELLS_PROPERTY = "mycar:lit_cells";
export const LIGHT_BLOCK = "minecraft:light_block_15";
/**
 * Test input messages have the form "<vehicleId>,<moveX>,<moveY>,<jump>[,<pitch>]"
 * (jump is 0 / 1, pitch in degrees with negative looking up). "<vehicleId>,clear"
 * clears the input.
 */
export const TEST_INPUT_EVENT = "mycar:test_input";
/** Client-synced flight mode. The script reads it back after /reload, and the Resource Pack draws the flight visuals from it (ADR 0021). */
export const FLIGHT_PROPERTY = "mycar:flight";
export const HOVER_EVENT = "mycar:hover";
export const LAND_EVENT = "mycar:land";

/** Dyes that repaint a vehicle when used on it (ADR 0017). */
export const PAINT_BY_DYE: Readonly<Record<string, Paint>> = {
  "minecraft:green_dye": "green",
  "minecraft:red_dye": "red",
};
/** minecraft:variant value for each paint. The render controller picks the texture by this index. */
export const PAINT_VARIANT: Readonly<Record<Paint, number>> = {
  khaki: 0,
  green: 1,
  red: 2,
};
/** Entity event in packs/mycar_bp/entities/suv.json that sets the variant for a paint. */
export const paintEvent = (paint: Paint): string => `mycar:paint_${paint}`;
