import type { EngineCommand } from "../../drive";
import type { EntityContract } from "../../entityContract";
import { SPORTSBOAT_ATTITUDE } from "./attitude";

const { maxTrim, maxRoll } = SPORTSBOAT_ATTITUDE;

export const SPORTSBOAT_ENTITY = {
  properties: {
    trim: { type: "float", range: [0, maxTrim] },
    roll: { type: "float", range: [-maxRoll, maxRoll] },
    docked: { type: "bool" },
  },
  events: ["dock", "undock"],
  animations: [],
  restored: ["docked"],
} as const satisfies EntityContract;

function property(
  name: keyof typeof SPORTSBOAT_ENTITY.properties,
  value: number | boolean,
): EngineCommand {
  return { type: "setProperty", name, value };
}

export function trimCommand(degrees: number): EngineCommand {
  return property("trim", degrees);
}

export function rollCommand(degrees: number): EngineCommand {
  return property("roll", degrees);
}

function event(name: (typeof SPORTSBOAT_ENTITY.events)[number]): EngineCommand {
  return { type: "triggerEvent", name };
}

export function dockCommands(): EngineCommand[] {
  return [event("dock"), property("docked", true)];
}

export function undockCommands(): EngineCommand[] {
  return [event("undock"), property("docked", false)];
}
