// Flight mode: double-tap Jump to take off and land, and tilt the view to
// climb or sink (ADR 0020).
import { clamp } from "../shared/vec";
import { SPEC } from "./spec";

export const FLIGHT_MODES = ["ground", "takeoff", "flying", "landing"] as const;
export type FlightMode = (typeof FLIGHT_MODES)[number];

export function isFlightMode(value: unknown): value is FlightMode {
  return (FLIGHT_MODES as readonly unknown[]).includes(value);
}

export interface FlightState {
  readonly mode: FlightMode;
  /** Ticks spent in mode, counting the tick that entered it. */
  readonly modeTicks: number;
  readonly jumpHeld: boolean;
  /** Tick of the last Jump press that has not completed a double tap. */
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

/** Takeoff and landing run to the end, so a double tap only counts in these modes. */
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
  if (tap) lastTap = toggle || !accepts ? undefined : input.tick;
  const mode = nextMode(prev, input, toggle);
  return {
    mode,
    modeTicks: mode === prev.mode ? prev.modeTicks + 1 : 1,
    jumpHeld: input.jump,
    lastTap,
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
      if (!Number.isFinite(pitch) || !(tilt > 0) || !(speed > 0)) return 0;
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
