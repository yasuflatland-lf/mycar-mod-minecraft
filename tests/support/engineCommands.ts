import type { EngineCommand } from "../../src/domain/vehicle/drive";

export function propertyValue(
  commands: readonly EngineCommand[],
  name: string,
) {
  const command = commands.find(
    (command) => command.type === "setProperty" && command.name === name,
  );
  return command?.type === "setProperty" ? command.value : undefined;
}
