import type { EngineCommand } from "./drive";
import type { EntityContract } from "./entityContract";
import { FORMS, type Form } from "./form";
import { SPEC } from "./spec";

export const SUV_ENTITY = {
  properties: {
    form: { type: "enum", values: FORMS },
    bank: { type: "float", range: [-SPEC.maxBank, SPEC.maxBank] },
    gear_down: { type: "bool" },
  },
  events: ["gravity_on", "gravity_off"],
  animations: ["door_fr", "door_fl", "door_rr", "door_rl"],
  restored: ["form"],
} as const satisfies EntityContract;

/** Door bone name for each seat (ADR 0009). */
export const DOOR_BY_SEAT: readonly (typeof SUV_ENTITY.animations)[number][] =
  SUV_ENTITY.animations;

function property(
  name: keyof typeof SUV_ENTITY.properties,
  value: number | boolean | Form,
): EngineCommand {
  return { type: "setProperty", name, value };
}

export function formCommands(form: Form): EngineCommand[] {
  const name: (typeof SUV_ENTITY.events)[number] =
    form === "car" ? "gravity_on" : "gravity_off";
  // Gravity goes first so a failed event leaves the restored form unchanged (ADR 0021).
  return [{ type: "triggerEvent", name }, property("form", form)];
}

export function bankCommand(degrees: number): EngineCommand {
  return property("bank", degrees);
}

export function gearCommand(down: boolean): EngineCommand {
  return property("gear_down", down);
}

export function doorCommands(seat: number): EngineCommand[] {
  const name = DOOR_BY_SEAT[seat];
  return name === undefined
    ? []
    : [
        { type: "playAnimation", name },
        { type: "playSound", name: "random.door_open" },
      ];
}
