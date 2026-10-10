// src/domain/vehicle/spec.ts
// 車の設定値。値の理由は docs/adr/0002〜0008。
export const SPEC = {
  // 運転 (ADR 0002)
  maxSpeed: 0.9, // ブロック/tick
  maxReverse: 0.2,
  accel: 0.0225,
  brake: 0.04,
  drag: 0.02,
  turnRate: 6, // 度/tick (最大に切ったとき)
  steerFullSpeed: 0.08, // この速度以上でハンドルが最大に効く
  grip: 0.6,
  handbrakeGrip: 0.04,
  mountAlignSpeed: 0.01, // これ未満なら乗り込み時に車の向きを運転者の視線に合わせる
  // 摩擦と壁 (ADR 0003)
  defaultFriction: 0.69,
  frictionMin: 0.5,
  frictionMax: 1,
  frictionEma: 0.2,
  airFriction: 0.91,
  airControl: 0.2,
  blockedAxisMin: 0.03,
  blockedRatio: 0.5,
  minExpectedForFriction: 0.05,
  // 段差 (ADR 0004)
  hitboxFront: 0.9,
  carHeight: 1.6,
  stepVelocity: 0.75,
  stepTicks: 10,
  stepMinSpeed: 0.15,
  stepLookaheadTicks: 4,
  stepLookaheadMargin: 0.3,
  stepLaneOffset: 0.8,
  stepScanStep: 0.2,
  // 入力 (ADR 0005)
  throttleDeadzone: 0.1,
  throttleFullAt: 0.5,
  // 衝突 (ADR 0006)
  bodyFront: 1.65,
  bodyHalfWidth: 1.0,
  targetHalfWidth: 0.45,
  ramMinSpeed: 0.15,
  ramCooldown: 10,
  ramDamagePerSpeed: 20,
  ramPushBase: 0.5,
  ramPushPerSpeed: 2.5,
  ramPushUp: 0.35,
  ramMinDy: -0.5,
  ramMaxDy: 1.8,
  // 出し入れ (ADR 0008)
  hitsToBreak: 3,
  hitResetTicks: 100,
} as const;
