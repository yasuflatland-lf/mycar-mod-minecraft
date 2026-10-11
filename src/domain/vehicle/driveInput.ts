import { clamp } from "../shared/vec";
import { SPEC } from "./spec";

export interface RawInput {
  moveX: number;
  moveY: number;
  jump: boolean;
}
export interface DriveInput {
  throttle: number;
  steer: number;
  handbrake: boolean;
  /** Steering with the stick held sideways: move forward slowly instead of throttling (ADR 0018). */
  creep: boolean;
}

export const NEUTRAL_INPUT: DriveInput = {
  throttle: 0,
  steer: 0,
  handbrake: false,
  creep: false,
};

const SIDEWAYS_SLOPE = Math.tan((SPEC.sidewaysAngle * Math.PI) / 180);

/** Converts the movement vector and jump input to throttle, steering, and handbrake (ADR 0018). */
export function toDriveInput(raw: RawInput): DriveInput {
  if (!Number.isFinite(raw.moveX) || !Number.isFinite(raw.moveY)) {
    return NEUTRAL_INPUT;
  }
  const steer = clamp(raw.moveX, -1, 1);
  const sideways = Math.abs(steer);
  // A phone stick pushed straight right reads about -0.2 forward/backward,
  // which would otherwise reverse the vehicle and flip the steering.
  if (
    sideways > SPEC.throttleDeadzone &&
    Math.abs(raw.moveY) <= sideways * SIDEWAYS_SLOPE
  ) {
    return { throttle: 0, steer, handbrake: raw.jump, creep: true };
  }
  const magnitude = Math.abs(raw.moveY);
  const throttle =
    magnitude <= SPEC.throttleDeadzone
      ? 0
      : Math.sign(raw.moveY) * Math.min(1, magnitude / SPEC.throttleFullAt);
  return { throttle, steer, handbrake: raw.jump, creep: false };
}
