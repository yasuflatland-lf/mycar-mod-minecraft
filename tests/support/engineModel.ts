import type { Vec2 } from "../../src/domain/shared/vec";

export const HALF_WIDTH = 0.9;
// Per-tick horizontal air drag. Kept apart from SPEC.airFriction so that a
// wrong assumption in the script shows up as a failing property.
export const AIR_DRAG = 0.91;

export interface Engine {
  mu: number;
  wallX?: number;
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
  const drag = onGround ? e.mu : AIR_DRAG;
  return {
    body: { pos: { x: px, z: pz }, vel: { x: vx * drag, z: vz * drag } },
    touching,
  };
}
