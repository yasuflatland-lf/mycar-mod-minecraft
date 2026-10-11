// Banking into turns in flight, like an airplane (ADR 0026).
import { clamp, normalizeYaw } from "../shared/vec";
import type { FlightMode } from "./flight";
import { SPEC } from "./spec";

/**
 * Next bank angle in degrees; positive lowers the right side. In flight the
 * target follows how fast the heading turns, so a turn at the full turn rate
 * banks fully whatever the speed or direction of travel. Off the flying mode
 * the target is level. The angle moves toward the target by at most
 * `SPEC.bankRate` per tick.
 */
export function stepBank(
  prev: number,
  mode: FlightMode,
  yawBefore: number,
  yawAfter: number,
): number {
  const turn = normalizeYaw(yawAfter - yawBefore) / SPEC.turnRate;
  const target =
    mode === "flying" && Number.isFinite(turn)
      ? clamp(turn, -1, 1) * SPEC.maxBank
      : 0;
  return prev + clamp(target - prev, -SPEC.bankRate, SPEC.bankRate);
}

/** Altitude lost per tick while flying banked, in proportion to the bank angle. */
export function bankSink(mode: FlightMode, bank: number): number {
  if (mode !== "flying") return 0;
  return (Math.abs(bank) / SPEC.maxBank) * SPEC.bankSink;
}
