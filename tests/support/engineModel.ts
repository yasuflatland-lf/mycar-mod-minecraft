import type { Vec2 } from "../../src/domain/shared/vec";

export const HALF_WIDTH = 0.9;
// Per-tick horizontal air drag. Kept apart from SPEC.airFriction so that a
// wrong assumption in the script shows up as a failing property.
export const AIR_DRAG = 0.91;

export interface Engine {
  mu: number;
  wallX?: number;
  drag?: number;
}
export interface Body {
  pos: Vec2;
  vel: Vec2;
}

export function engineStep(
  b: Body,
  impulse: Vec2,
  e: Engine,
  onGround = true,
): { body: Body; touching: boolean } {
  let vx = b.vel.x + impulse.x;
  const vz = b.vel.z + impulse.z;
  let px = b.pos.x + vx;
  const pz = b.pos.z + vz;
  let touching = false;
  if (e.wallX !== undefined && vx > 0 && px + HALF_WIDTH > e.wallX) {
    px = e.wallX - HALF_WIDTH;
    vx = 0;
    touching = true;
  }
  const drag = e.drag ?? (onGround ? e.mu : AIR_DRAG);
  return {
    body: { pos: { x: px, z: pz }, vel: { x: vx * drag, z: vz * drag } },
    touching,
  };
}

// Vanilla living-entity values per tick. Kept apart from
// SPEC.flightVerticalDrag for the same reason as AIR_DRAG.
export const GRAVITY = 0.08;
export const VERTICAL_DRAG = 0.98;

// Engine drag in water with gravity off, as the submarine_dive in-game test
// measured it (rounded). Kept apart from SPEC.waterDrag for the same reason as
// AIR_DRAG.
export const WATER_DRAG = 0.83;
export const WATER_VERTICAL_DRAG = 0.83;
