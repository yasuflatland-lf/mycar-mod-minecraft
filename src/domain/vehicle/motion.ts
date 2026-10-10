// src/domain/vehicle/motion.ts
// 1 tick 分の走行の計算 (ADR 0002, 0003)。
import {
  clamp,
  clampLength,
  dot,
  forward,
  normalizeYaw,
  type Vec2,
} from "../shared/vec";
import type { DriveInput } from "./driveInput";
import { SPEC } from "./spec";

export interface MotionState {
  speed: number; // 前後方向の内部速度 (ブロック/tick、負は後退)
  yaw: number;
  friction?: number; // 地面摩擦の推定値。未推定なら undefined
  expected?: Vec2; // 前 tick にスクリプトが与えた水平速度
  stepTicks: number; // 段差で跳んでから空中でも制御する残り tick
  blocked: boolean; // この tick に壁に当たっていると判定したか
}

export const initialMotion = (yaw: number): MotionState => ({
  speed: 0,
  yaw: normalizeYaw(yaw),
  stepTicks: 0,
  blocked: false,
});

export interface Observation {
  velocity: Vec2;
  onGround: boolean;
}
export type StepProbe = (f: Vec2, speed: number) => boolean;
export interface MotionResult {
  state: MotionState;
  forward: Vec2;
  impulse: Vec2;
  jumped: boolean;
}

export function updateSpeed(speed: number, throttle: number): number {
  let s = speed;
  if (throttle > 0) s += (s < 0 ? SPEC.brake : SPEC.accel) * throttle;
  else if (throttle < 0)
    s += (s > 0 ? SPEC.brake : SPEC.accel * 0.5) * throttle;
  else s -= Math.sign(s) * Math.min(Math.abs(s), SPEC.drag);
  return clamp(s, -SPEC.maxReverse, SPEC.maxSpeed);
}

/** 低速では曲がりにくく、後退時は逆に曲がる。左入力 (steer > 0) で yaw が減る。 */
export function steerYaw(yaw: number, speed: number, steer: number): number {
  const factor =
    Math.min(1, Math.abs(speed) / SPEC.steerFullSpeed) * Math.sign(speed);
  return normalizeYaw(yaw - steer * SPEC.turnRate * factor);
}

export function stepMotion(
  prev: MotionState,
  input: DriveInput,
  obs: Observation,
  probe: StepProbe,
): MotionResult {
  const st: MotionState = { ...prev };
  st.speed = updateSpeed(st.speed, input.throttle);
  st.yaw = steerYaw(st.yaw, st.speed, input.steer);
  const f = forward(st.yaw);
  const v = obs.velocity;
  const vLong = dot(v, f);

  // 前 tick に与えた速度のうち、どれだけ残ったかで摩擦と壁を見分ける (ADR 0003)
  st.blocked = false;
  if (st.expected && obs.onGround) {
    const e = st.expected;
    const limit = (st.friction ?? SPEC.defaultFriction) * SPEC.blockedRatio;
    // 壁はエンジンが軸ごとに速度を 0 にするので、x・z の軸ごとに見る
    const axisBlocked = (ve: number, ee: number) =>
      Math.abs(ee) > SPEC.blockedAxisMin && ve / ee < limit;
    st.blocked = axisBlocked(v.x, e.x) || axisBlocked(v.z, e.z);
    if (st.blocked) {
      // 衝突中は摩擦の推定を止め、内部の速度を実際の前方速度まで落とす。後退の上限で頭打ちにする
      if (Math.abs(vLong) < Math.abs(st.speed))
        st.speed = clamp(vLong, -SPEC.maxReverse, SPEC.maxSpeed);
    } else {
      const eLen2 = e.x * e.x + e.z * e.z;
      if (eLen2 > SPEC.minExpectedForFriction ** 2) {
        const r = clamp(dot(v, e) / eLen2, SPEC.frictionMin, SPEC.frictionMax);
        st.friction =
          st.friction === undefined
            ? r
            : st.friction * (1 - SPEC.frictionEma) + r * SPEC.frictionEma;
      }
    }
  }
  const friction = obs.onGround
    ? (st.friction ?? SPEC.defaultFriction)
    : SPEC.airFriction;

  // 2 段の段差 (ADR 0004)
  let jumped = false;
  if (
    input.throttle > 0 &&
    st.speed >= 0 &&
    obs.onGround &&
    probe(f, st.speed)
  ) {
    jumped = true;
    st.speed = Math.max(st.speed, SPEC.stepMinSpeed);
    st.stepTicks = SPEC.stepTicks;
  }
  const stepping = st.stepTicks > 0;
  if (stepping) st.stepTicks--;

  // 前後成分は内部の速度に、横成分は grip の割合だけ打ち消す。合成した速さは最高速度で頭打ち (ADR 0002)
  const lat = { x: v.x - f.x * vLong, z: v.z - f.z * vLong };
  const grip = input.handbrake ? SPEC.handbrakeGrip : SPEC.grip;
  const keepLat = stepping ? 0 : 1 - grip;
  const target = clampLength(
    {
      x: f.x * st.speed + lat.x * keepLat,
      z: f.z * st.speed + lat.z * keepLat,
    },
    SPEC.maxSpeed,
  );
  // 摩擦で減る分を見越して上乗せする
  const n = { x: target.x / friction, z: target.z / friction };
  st.expected = n;
  const control = obs.onGround || stepping ? 1 : SPEC.airControl;
  return {
    state: st,
    forward: f,
    jumped,
    impulse: { x: (n.x - v.x) * control, z: (n.z - v.z) * control },
  };
}
