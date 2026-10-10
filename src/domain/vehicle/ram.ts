// src/domain/vehicle/ram.ts
// Select targets in a rectangle in front of the car (behind it when reversing) and decide the damage and push (ADR 0006).
import type { Vec2, Vec3 } from "../shared/vec";
import { SPEC } from "./spec";

export interface RamTarget {
  id: string;
  offset: Vec3;
  protectedOccupant: boolean;
}
export interface RamHit {
  id: string;
  damage: number;
  push: Vec2;
  pushUp: number;
}

export const ramDamage = (speed: number): number =>
  Math.max(1, Math.round(Math.abs(speed) * SPEC.ramDamagePerSpeed));

export function selectHits(
  f: Vec2,
  speed: number,
  targets: readonly RamTarget[],
  lastHit: ReadonlyMap<string, number>,
  tick: number,
): RamHit[] {
  if (Math.abs(speed) <= SPEC.ramMinSpeed) return [];
  const dir = Math.sign(speed);
  const reach = SPEC.bodyFront + SPEC.targetHalfWidth;
  const halfWidth = SPEC.bodyHalfWidth + SPEC.targetHalfWidth;
  const hits: RamHit[] = [];
  for (const t of targets) {
    if (t.protectedOccupant) continue; // Always protect occupants
    const ahead = (t.offset.x * f.x + t.offset.z * f.z) * dir;
    const side = Math.abs(t.offset.x * f.z - t.offset.z * f.x);
    if (ahead < 0 || ahead > reach || side > halfWidth) continue;
    if (t.offset.y < SPEC.ramMinDy || t.offset.y > SPEC.ramMaxDy) continue;
    const last = lastHit.get(t.id);
    if (last !== undefined && tick - last < SPEC.ramCooldown) continue;
    const push = SPEC.ramPushBase + Math.abs(speed) * SPEC.ramPushPerSpeed;
    hits.push({
      id: t.id,
      damage: ramDamage(speed),
      push: { x: f.x * dir * push, z: f.z * dir * push },
      pushUp: SPEC.ramPushUp,
    });
  }
  return hits;
}
