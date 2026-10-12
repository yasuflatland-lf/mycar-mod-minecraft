// Select targets in a rectangle in front of the car (behind it when reversing) and decide the damage and push (ADR 0006).
import { dot, rightOf, type Vec2, type Vec3 } from "../shared/vec";
import type { RamBody } from "./profile";
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

export function ramDamage(speed: number): number {
  return Math.max(1, Math.round(Math.abs(speed) * SPEC.ramDamagePerSpeed));
}

export function selectHits(
  f: Vec2,
  speed: number,
  targets: readonly RamTarget[],
  lastHit: ReadonlyMap<string, number>,
  tick: number,
  body: RamBody,
): RamHit[] {
  if (Math.abs(speed) <= SPEC.ramMinSpeed) return [];
  const dir = Math.sign(speed);
  const right = rightOf(f);
  const reach = body.front + SPEC.targetHalfWidth;
  const halfWidth = body.halfWidth + SPEC.targetHalfWidth;
  const damage = ramDamage(speed);
  const pushSpeed =
    dir * (SPEC.ramPushBase + Math.abs(speed) * SPEC.ramPushPerSpeed);
  const push = { x: f.x * pushSpeed, z: f.z * pushSpeed };
  const hits: RamHit[] = [];
  for (const t of targets) {
    if (t.protectedOccupant) continue;
    const ahead = dot(t.offset, f) * dir;
    const side = Math.abs(dot(t.offset, right));
    if (ahead < 0 || ahead > reach || side > halfWidth) continue;
    if (t.offset.y < SPEC.ramMinDy || t.offset.y > SPEC.ramMaxDy) continue;
    const last = lastHit.get(t.id);
    if (last !== undefined && tick - last < SPEC.ramCooldown) continue;
    hits.push({ id: t.id, damage, push, pushUp: SPEC.ramPushUp });
  }
  return hits;
}
