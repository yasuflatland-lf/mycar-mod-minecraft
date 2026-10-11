// Banking into turns in flight, like an airplane (ADR 0026), and under water (ADR 0044).
import { clamp, normalizeYaw } from "../shared/vec";
import type { Form } from "./form";
import { SPEC } from "./spec";

/**
 * Next bank angle in degrees; positive lowers the right side. In flight and
 * under water the target follows how fast the heading turns, so a turn at the
 * full turn rate banks fully whatever the speed or direction of travel. In
 * every other form the target is level. The angle moves toward the target by at most
 * `SPEC.bankRate` per tick.
 */
export function stepBank(
  prev: number,
  form: Form,
  yawBefore: number,
  yawAfter: number,
): number {
  const turn = normalizeYaw(yawAfter - yawBefore) / SPEC.turnRate;
  const target =
    (form === "hover" || form === "submarine") && Number.isFinite(turn)
      ? clamp(turn, -1, 1) * SPEC.maxBank
      : 0;
  return prev + clamp(target - prev, -SPEC.bankRate, SPEC.bankRate);
}

/** Altitude lost per tick while flying banked, in proportion to the bank angle. */
export function bankSink(form: Form, bank: number): number {
  if (form !== "hover") return 0;
  return (Math.abs(bank) / SPEC.maxBank) * SPEC.bankSink;
}
