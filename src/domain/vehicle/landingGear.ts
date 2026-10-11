// Landing gear: the wheels unfold before touchdown instead of after (ADR 0033).
import type { FlightMode } from "./flight";

/**
 * Whether the wheels should be in the driving pose. Takeoff and flight fold
 * them. While landing they come down once the ground is near and stay down,
 * so passing over a dip does not fold them again. `groundNear` is only called
 * while landing with the wheels still folded.
 */
export function nextGearDown(
  prev: boolean,
  mode: FlightMode,
  groundNear: () => boolean,
): boolean {
  switch (mode) {
    case "ground":
      return true;
    case "takeoff":
    case "flying":
      return false;
    case "landing":
      return prev || groundNear();
  }
}
