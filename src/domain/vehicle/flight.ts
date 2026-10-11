// Flight mode: double-tap Jump to take off and land (ADR 0021), hold Jump to
// climb and pull the stick back to sink (ADR 0031).
import { clamp } from "../shared/vec";
import { type RawInput, toDriveInput } from "./driveInput";
import { SPEC } from "./spec";

export const FLIGHT_MODES = ["ground", "takeoff", "flying", "landing"] as const;
export type FlightMode = (typeof FLIGHT_MODES)[number];

export function isFlightMode(value: unknown): value is FlightMode {
  return (FLIGHT_MODES as readonly unknown[]).includes(value);
}

export interface FlightState {
  readonly mode: FlightMode;
  /** Ticks spent in mode, counting the tick that entered it; 0 for a state built by initialFlight. */
  readonly modeTicks: number;
  readonly jumpHeld: boolean;
  /** Tick of the last Jump press in this mode that has not completed a double tap. */
  readonly lastTap: number | undefined;
}

export interface FlightInput {
  tick: number;
  jump: boolean;
  /** Whether a driver or test input controls the vehicle. */
  controlled: boolean;
  onGround: boolean;
}

export function initialFlight(mode: FlightMode = "ground"): FlightState {
  return { mode, modeTicks: 0, jumpHeld: false, lastTap: undefined };
}

/** A double tap toggles only on the ground or in flight; takeoff and landing always run to the end. */
function acceptsToggle(mode: FlightMode): boolean {
  return mode === "ground" || mode === "flying";
}

function nextMode(
  prev: FlightState,
  input: FlightInput,
  toggle: boolean,
): FlightMode {
  switch (prev.mode) {
    case "ground":
      return toggle && input.controlled ? "takeoff" : "ground";
    case "takeoff":
      return prev.modeTicks >= SPEC.takeoffTicks ? "flying" : "takeoff";
    case "flying":
      // Sinking onto the ground lands at once, as touchdown ends landing (ADR 0033).
      if (input.onGround) return "ground";
      return toggle || !input.controlled ? "landing" : "flying";
    case "landing":
      return input.onGround ? "ground" : "landing";
  }
}

export function stepFlight(prev: FlightState, input: FlightInput): FlightState {
  const tap = input.jump && !prev.jumpHeld;
  const accepts = acceptsToggle(prev.mode);
  const toggle =
    tap &&
    accepts &&
    prev.lastTap !== undefined &&
    input.tick - prev.lastTap <= SPEC.doubleTapTicks;
  let lastTap = prev.lastTap;
  if (tap) lastTap = accepts && !toggle ? input.tick : undefined;
  const mode = nextMode(prev, input, toggle);
  return {
    mode,
    modeTicks: mode === prev.mode ? prev.modeTicks + 1 : 1,
    jumpHeld: input.jump,
    // A tap left over from flying would otherwise pair with the first tap
    // after a driverless landing and take off again.
    lastTap: mode === prev.mode ? lastTap : undefined,
  };
}

/**
 * Climb command from -1 (sink) to 1 (climb): held Jump climbs and the stick
 * pulled back sinks, so both together cancel out. A sideways stick only
 * steers and creeps (ADR 0018), so it never sinks.
 */
export function climbInput(raw: RawInput | undefined): number {
  if (!raw) return 0;
  const back = Math.min(0, toDriveInput(raw).throttle);
  return clamp((raw.jump ? 1 : 0) + back, -1, 1);
}

/**
 * Target vertical velocity in blocks/tick. While flying, the climb command
 * sets it whatever the view pitch or the forward speed (ADR 0031).
 */
export function flightVerticalSpeed(mode: FlightMode, climb: number): number {
  switch (mode) {
    case "ground":
      return 0;
    case "takeoff":
      return SPEC.takeoffClimb;
    case "landing":
      return -SPEC.landingSink;
    case "flying":
      return Number.isFinite(climb) ? clamp(climb, -1, 1) * SPEC.maxClimb : 0;
  }
}

/** Pre-divides by the vertical drag so the velocity left after this tick is the target (as ADR 0003 does for friction). */
export function verticalImpulse(targetVy: number, vy: number): number {
  return targetVy / SPEC.flightVerticalDrag - vy;
}
