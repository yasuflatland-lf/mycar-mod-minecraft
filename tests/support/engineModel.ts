import type { Vec2 } from "../../src/domain/shared/vec";

export const HALF_WIDTH = 0.9;

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
  return {
    body: { pos: { x: px, z: pz }, vel: { x: vx * e.mu, z: vz * e.mu } },
    touching,
  };
}
