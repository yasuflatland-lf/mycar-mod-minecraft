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
}

export const NEUTRAL_INPUT: DriveInput = {
  throttle: 0,
  steer: 0,
  handbrake: false,
};

/** Converts the movement vector and jump input to throttle, steering, and handbrake (ADR 0005). */
export function toDriveInput(raw: RawInput): DriveInput {
  const magnitude = Math.abs(raw.moveY);
  const throttle =
    magnitude <= SPEC.throttleDeadzone
      ? 0
      : Math.sign(raw.moveY) * Math.min(1, magnitude / SPEC.throttleFullAt);
  return { throttle, steer: clamp(raw.moveX, -1, 1), handbrake: raw.jump };
}
