import { clamp } from "../../../domain/shared/vec";
import type { RawInput } from "../../../domain/vehicle/driveInput";

export function parseTestInputMessage(
  message: string,
): { vehicleId: string; input: RawInput | undefined } | undefined {
  const parts = message.split(",");
  const vehicleId = parts[0];
  if (!vehicleId) return undefined;
  if (parts.length === 2 && parts[1] === "clear") {
    return { vehicleId, input: undefined };
  }
  if (parts.length !== 4) return undefined;
  const [, x = "", y = "", jump] = parts;
  if (x.trim() === "" || y.trim() === "") return undefined;
  const moveX = Number(x);
  const moveY = Number(y);
  if (!Number.isFinite(moveX) || !Number.isFinite(moveY)) return undefined;
  if (jump !== "0" && jump !== "1") return undefined;
  return {
    vehicleId,
    input: {
      moveX: clamp(moveX, -1, 1),
      moveY: clamp(moveY, -1, 1),
      jump: jump === "1",
    },
  };
}
