// src/domain/vehicle/driveInput.ts
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
  if (!Number.isFinite(raw.moveX) || !Number.isFinite(raw.moveY)) {
    return NEUTRAL_INPUT;
  }
  const y = raw.moveY;
  const throttle =
    Math.abs(y) <= SPEC.throttleDeadzone
      ? 0
      : Math.sign(y) * Math.min(1, Math.abs(y) / SPEC.throttleFullAt);
  return { throttle, steer: clamp(raw.moveX, -1, 1), handbrake: raw.jump };
}
