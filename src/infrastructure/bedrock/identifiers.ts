import type { Paint } from "../../domain/vehicle/paint";

export const VEHICLE_TYPE = "mycar:suv";
export const ITEM_TYPE = "mycar:suv_item";
export const PLAYER_TYPE = "minecraft:player";
/** Test input messages have the form "<vehicleId>,<moveX>,<moveY>,<jump>" (jump is 0 / 1). "<vehicleId>,clear" clears the input. */
export const TEST_INPUT_EVENT = "mycar:test_input";

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
