// Landing gear: the wheels unfold before touchdown instead of after (ADR 0033).
import type { Form } from "./form";

/**
 * Whether the wheels should be in the driving pose. Takeoff and flight fold
 * them. While landing they come down once the ground is near and stay down,
 * so passing over a dip does not fold them again. `groundNear` is only called
 * while landing with the wheels still folded.
 */
export function nextGearDown(
  prev: boolean,
  form: Form,
  groundNear: () => boolean,
): boolean {
  switch (form) {
    case "car":
      return true;
    case "takeoff":
    case "hover":
      return false;
    case "landing":
      return prev || groundNear();
  }
}
