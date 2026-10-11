// Forms of the transforming vehicle (ADR 0039): double-tap Jump to take off
// and land (ADR 0021), hold Jump to climb and pull the stick back to sink (ADR 0032).
import { clamp } from "../shared/vec";
import { type RawInput, toDriveInput } from "./driveInput";
import { SPEC } from "./spec";

export const FORMS = [
  "car",
  "takeoff",
  "hover",
  "landing",
  "submarine",
] as const;
export type Form = (typeof FORMS)[number];

export function isForm(value: unknown): value is Form {
  return (FORMS as readonly unknown[]).includes(value);
}

export interface FormState {
  readonly form: Form;
  /** Ticks spent in form, counting the tick that entered it; 0 for a state built by initialForm. */
  readonly formTicks: number;
  readonly jumpHeld: boolean;
  /** Tick of the last Jump press in this form that has not completed a double tap. */
  readonly lastTap: number | undefined;
}

export interface FormInput {
  tick: number;
  jump: boolean;
  /** Whether a driver or test input controls the vehicle. */
  controlled: boolean;
  onGround: boolean;
  /** Water surface height above the feet in blocks; 0 out of water, capped at carHeight + 1 by infrastructure. */
  waterDepth: number;
}

export function isSubmerged(waterDepth: number): boolean {
  return waterDepth >= SPEC.carHeight;
}

export function isDry(waterDepth: number): boolean {
  return !(waterDepth > 0);
}

export function initialForm(form: Form = "car"): FormState {
  return { form, formTicks: 0, jumpHeld: false, lastTap: undefined };
}

/**
 * A double tap toggles only in car or hover form, so it cannot cancel takeoff
 * or landing (submergence can). Submarine rises with held Jump instead.
 */
function acceptsToggle(form: Form): boolean {
  return form === "car" || form === "hover";
}

function nextForm(prev: FormState, input: FormInput, toggle: boolean): Form {
  if (isSubmerged(input.waterDepth)) return "submarine";
  switch (prev.form) {
    case "car":
      return toggle && input.controlled ? "takeoff" : "car";
    case "takeoff":
      return prev.formTicks >= SPEC.takeoffTicks ? "hover" : "takeoff";
    case "hover":
      // Sinking onto the ground lands at once, as touchdown ends landing (ADR 0034).
      if (input.onGround) return "car";
      return toggle || !input.controlled ? "landing" : "hover";
    case "landing":
      return input.onGround ? "car" : "landing";
    case "submarine":
      if (isDry(input.waterDepth))
        return input.controlled && input.jump ? "hover" : "car";
      return input.onGround ? "car" : "submarine";
  }
}

export function stepForm(prev: FormState, input: FormInput): FormState {
  const tap = input.jump && !prev.jumpHeld;
  const accepts = acceptsToggle(prev.form);
  const toggle =
    tap &&
    accepts &&
    prev.lastTap !== undefined &&
    input.tick - prev.lastTap <= SPEC.doubleTapTicks;
  let lastTap = prev.lastTap;
  if (tap) lastTap = accepts && !toggle ? input.tick : undefined;
  const form = nextForm(prev, input, toggle);
  return {
    form,
    formTicks: form === prev.form ? prev.formTicks + 1 : 1,
    jumpHeld: input.jump,
    // A tap left over from hover would otherwise pair with the first tap
    // after a driverless landing and take off again.
    lastTap: form === prev.form ? lastTap : undefined,
  };
}

/**
 * Climb command from -1 (sink) to 1 (climb): held Jump climbs and the stick
 * pulled back sinks; Jump with the stick pulled fully back (past
 * `throttleFullAt`) holds altitude. A sideways stick only
 * steers and creeps (ADR 0018), so it never sinks.
 */
export function climbInput(raw: RawInput | undefined): number {
  if (!raw) return 0;
  const back = Math.min(0, toDriveInput(raw).throttle);
  return clamp((raw.jump ? 1 : 0) + back, -1, 1);
}

/**
 * Target vertical velocity in blocks/tick. In hover form, the climb command
 * sets it independent of the forward speed (ADR 0032).
 * The aggregate uses submarineVerticalSpeed for submarine form.
 */
export function verticalSpeed(form: Form, climb: number): number {
  switch (form) {
    case "car":
    case "submarine":
      return 0;
    case "takeoff":
      return SPEC.takeoffClimb;
    case "landing":
      return -SPEC.landingSink;
    case "hover":
      return Number.isFinite(climb) ? clamp(climb, -1, 1) * SPEC.maxClimb : 0;
  }
}

/** Pre-divides by the vertical drag so the velocity left after this tick is the target (as ADR 0003 does for friction). */
export function verticalImpulse(
  targetVy: number,
  vy: number,
  drag: number = SPEC.flightVerticalDrag,
): number {
  return targetVy / drag - vy;
}
