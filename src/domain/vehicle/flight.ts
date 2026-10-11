// Flight mode: double-tap Jump to take off and land, and tilt the view to
// climb or sink (ADR 0021).
import { clamp } from "../shared/vec";
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
 * Target vertical velocity in blocks/tick. While flying, looking up climbs and
 * looking down sinks, in proportion to the forward speed, so a stopped vehicle
 * holds its altitude however the driver looks around.
 */
export function flightVerticalSpeed(
  mode: FlightMode,
  pitch: number,
  speed: number,
): number {
  switch (mode) {
    case "ground":
      return 0;
    case "takeoff":
      return SPEC.takeoffClimb;
    case "landing":
      return -SPEC.landingSink;
    case "flying": {
      const tilt = Math.abs(pitch) - SPEC.pitchDeadzone;
      if (!Number.isFinite(pitch) || tilt <= 0 || !(speed > 0)) return 0;
      const climb =
        -Math.sign(pitch) * Math.sin((tilt * Math.PI) / 180) * speed;
      return clamp(climb, -SPEC.maxClimb, SPEC.maxClimb);
    }
  }
}

/** Pre-divides by the vertical drag so the velocity left after this tick is the target (as ADR 0003 does for friction). */
export function verticalImpulse(targetVy: number, vy: number): number {
  return targetVy / SPEC.flightVerticalDrag - vy;
}
