// src/domain/vehicle/stepUp.ts
// 前方を先読みし、2 段の段差に近づいたら跳ぶかを決める (ADR 0004)。
import { SPEC } from "./spec";

export type SolidAt = (ahead: number, side: number, dy: number) => boolean;

/** 先読みする 3 本の線 (中心、右、左)。 */
export const STEP_LANES: readonly number[] = [0, -SPEC.stepLaneOffset, SPEC.stepLaneOffset];

export function shouldStepUp(solid: SolidAt, speed: number): boolean {
  if (solid(0, 0, 2.5)) return false; // 頭上がふさがっている
  const lookahead = speed * SPEC.stepLookaheadTicks + SPEC.stepLookaheadMargin;
  const from = SPEC.hitboxFront + 0.1;
  const to = SPEC.hitboxFront + lookahead + 1e-9;
  for (let d = from; d <= to; d += SPEC.stepScanStep) {
    let twoStep = false;
    for (const side of STEP_LANES) {
      if (!solid(d, side, 0.5)) continue; // この線上にはまだ障害物がない
      // 高さ 3 以上、または段差の上に車 (高さ 1.6) が入らない = 壁として止まる
      if (solid(d, side, 2.5) || solid(d, side, 3.5)) return false;
      if (solid(d, side, 1.5)) twoStep = true; // 高さ 1 ならエンジンに任せる
    }
    if (twoStep) return true;
  }
  return false;
}
