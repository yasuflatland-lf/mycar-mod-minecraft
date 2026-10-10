// src/domain/shared/vec.ts
export interface Vec2 {
  readonly x: number;
  readonly z: number;
}
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The direction a Minecraft yaw (in degrees) faces. yaw 0 = +z (south), yaw -90 = +x (east). */
export function forward(yawDeg: number): Vec2 {
  const r = (yawDeg * Math.PI) / 180;
  return { x: -Math.sin(r), z: Math.cos(r) };
}

export const rightOf = (f: Vec2): Vec2 => ({ x: -f.z, z: f.x });
export const leftOf = (f: Vec2): Vec2 => ({ x: f.z, z: -f.x });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;
export const length = (v: Vec2): number => Math.hypot(v.x, v.z);
export const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x));

export function clampLength(v: Vec2, max: number): Vec2 {
  const l = length(v);
  return l > max && l > 0 ? { x: (v.x * max) / l, z: (v.z * max) / l } : v;
}

export function normalizeYaw(yaw: number): number {
  const n = ((((yaw + 180) % 360) + 360) % 360) - 180;
  return n === -180 ? 180 : n;
}
