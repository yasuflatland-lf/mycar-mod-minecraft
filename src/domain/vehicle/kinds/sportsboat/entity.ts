import type { EngineCommand } from "../../drive";
import type { EntityContract } from "../../entityContract";
import { SPORTSBOAT_ATTITUDE } from "./attitude";

const { maxTrim, maxRoll } = SPORTSBOAT_ATTITUDE;

export const SPORTSBOAT_ENTITY = {
  properties: {
    trim: { type: "float", range: [0, maxTrim] },
    roll: { type: "float", range: [-maxRoll, maxRoll] },
  },
  events: [],
  animations: [],
  restored: [],
} as const satisfies EntityContract;

function property(
  name: keyof typeof SPORTSBOAT_ENTITY.properties,
  value: number,
): EngineCommand {
  return { type: "setProperty", name, value };
}

export function trimCommand(degrees: number): EngineCommand {
  return property("trim", degrees);
}

export function rollCommand(degrees: number): EngineCommand {
  return property("roll", degrees);
}
