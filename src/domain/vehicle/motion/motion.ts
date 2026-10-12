// One tick of vehicle movement (ADR 0002, 0003).
import {
  clamp,
  clampLength,
  dot,
  forward,
  normalizeYaw,
  type Vec2,
} from "../../shared/vec";
import type { DriveInput } from "../driveInput";
import type { MotionLimits } from "../profile";
import { MOTION } from "./constants";

export interface Medium {
  readonly drag: number;
  readonly maxSpeed: number;
  /**
   * Drag the per-axis wall check compares against, `drag` when absent. A
   * medium whose drag is estimated each tick sets it to the estimate the
   * estimator checked walls against, so one tick gets one wall decision
   * (ADR 0053).
   */
  readonly wallDrag?: number;
}

export interface MotionState {
  speed: number; // Internal forward/reverse speed (blocks/tick; negative means reverse)
  yaw: number;
  friction?: number; // Ground friction estimate; undefined until estimated
  // Velocity the script aimed for in the previous tick. Kept only when that
  // tick was on the ground: in the air the engine applies airFriction and only
  // airControl of the impulse, so the ratio would not measure ground friction.
  expected?: Vec2;
  // Velocity flight aimed for in the previous tick, kept apart from
  // `expected` so flight ratios never feed the ground friction estimate.
  airExpected?: Vec2;
  stepTicks: number; // Remaining ticks of control in the air after jumping up a step
}

export function initialMotion(yaw: number): MotionState {
  return { speed: 0, yaw: normalizeYaw(yaw), stepTicks: 0 };
}

/** Turns to a boarding driver's yaw when nearly stopped (ADR 0019). */
export function alignOnMount(
  state: MotionState,
  driverYaw: number,
): MotionState {
  return Math.abs(state.speed) < MOTION.mountAlignSpeed
    ? { ...state, yaw: driverYaw }
    : state;
}

export interface Observation {
  velocity: Vec2;
  onGround: boolean;
}
/** Height of the step to jump onto now: 0 for none (ADR 0004, 0035). */
export type StepProbe = (f: Vec2, speed: number) => 0 | 1 | 2;
export interface MotionResult {
  state: MotionState;
  forward: Vec2;
  impulse: Vec2;
  /** Upward velocity to give for a step jump this tick, 0 when not jumping (ADR 0004, 0035). */
  jumpVelocity: number;
  blocked: boolean; // Whether a wall collision was detected this tick
}

export function updateSpeed(
  speed: number,
  throttle: number,
  creep: boolean,
  limits: MotionLimits,
): number {
  if (creep) {
    if (speed >= limits.creepSpeed)
      return Math.max(limits.creepSpeed, speed - limits.drag);
    return Math.min(
      limits.creepSpeed,
      speed + (speed < 0 ? limits.brake : limits.accel),
    );
  }
  let s = speed;
  if (throttle > 0) s += (s < 0 ? limits.brake : limits.accel) * throttle;
  else if (throttle < 0)
    s += (s > 0 ? limits.brake : limits.reverseAccel) * throttle;
  else s -= Math.sign(s) * Math.min(Math.abs(s), limits.drag);
  return clamp(s, -limits.maxReverse, limits.maxSpeed);
}

/** Steering is weaker at low speed and reversed when backing up. Left input (steer > 0) decreases yaw. */
export function steerYaw(
  yaw: number,
  speed: number,
  steer: number,
  limits: MotionLimits,
): number {
  const factor =
    Math.min(1, Math.abs(speed) / limits.steerFullSpeed) * Math.sign(speed);
  return normalizeYaw(yaw - steer * limits.turnRate * factor);
}

/**
 * Whether the observed velocity kept less than `keptRatio` of what was given
 * on either axis. The engine zeroes velocity per axis at walls, so x and z
 * are checked separately (ADR 0003).
 */
export function hitWall(v: Vec2, given: Vec2, keptRatio: number): boolean {
  const axisBlocked = (ve: number, ee: number) =>
    Math.abs(ee) > MOTION.blockedAxisMin && ve / ee < keptRatio;
  return axisBlocked(v.x, given.x) || axisBlocked(v.z, given.z);
}

/** Lowers the internal speed to the actual forward speed after a wall hit. */
function speedAfterWall(
  speed: number,
  vLong: number,
  limits: MotionLimits,
): number {
  if (Math.abs(vLong) >= Math.abs(speed)) return speed;
  return clamp(vLong, -limits.maxReverse, limits.maxSpeed);
}

export function stepMotion(
  prev: MotionState,
  input: DriveInput,
  obs: Observation,
  probe: StepProbe,
  limits: MotionLimits,
): MotionResult {
  const st: MotionState = { ...prev, airExpected: undefined };
  st.speed = updateSpeed(st.speed, input.throttle, input.creep, limits);
  st.yaw = steerYaw(st.yaw, st.speed, input.steer, limits);
  const f = forward(st.yaw);
  const v = obs.velocity;
  const vLong = dot(v, f);

  // Distinguish friction from wall collisions by how much of the previous
  // tick's given velocity remains (ADR 0003).
  let blocked = false;
  if (st.expected && obs.onGround) {
    const e = st.expected;
    const limit = (st.friction ?? MOTION.defaultFriction) * MOTION.blockedRatio;
    blocked = hitWall(v, e, limit);
    if (blocked) {
      // While colliding, freeze the friction estimate.
      st.speed = speedAfterWall(st.speed, vLong, limits);
    } else {
      const eLen2 = e.x * e.x + e.z * e.z;
      if (eLen2 > MOTION.minExpectedForFriction ** 2) {
        const r = clamp(
          dot(v, e) / eLen2,
          MOTION.frictionMin,
          MOTION.frictionMax,
        );
        st.friction =
          st.friction === undefined
            ? r
            : st.friction * (1 - MOTION.frictionEma) + r * MOTION.frictionEma;
      }
    }
  }
  const friction = obs.onGround
    ? (st.friction ?? MOTION.defaultFriction)
    : MOTION.airFriction;

  // Steps (ADR 0004, 0035)
  let jumpVelocity = 0;
  const height =
    input.throttle > 0 && st.speed >= 0 && obs.onGround
      ? probe(f, st.speed)
      : 0;
  if (height > 0) {
    jumpVelocity = height === 2 ? MOTION.stepVelocity : MOTION.oneStepVelocity;
    st.speed = Math.max(st.speed, MOTION.stepMinSpeed);
    st.stepTicks = MOTION.stepTicks;
  }
  const stepping = st.stepTicks > 0;
  if (stepping) st.stepTicks--;

  // Set the forward component to the internal speed, cancel a grip-sized
  // fraction of the sideways component, and cap the result at max speed (ADR 0002).
  const lat = { x: v.x - f.x * vLong, z: v.z - f.z * vLong };
  const grip = input.handbrake ? limits.handbrakeGrip : limits.grip;
  const keepLat = stepping ? 0 : 1 - grip;
  const target = clampLength(
    {
      x: f.x * st.speed + lat.x * keepLat,
      z: f.z * st.speed + lat.z * keepLat,
    },
    limits.maxSpeed,
  );
  // Pre-divide by friction so the velocity left after the engine applies
  // friction this tick is the target.
  const given = { x: target.x / friction, z: target.z / friction };
  st.expected = obs.onGround ? given : undefined;
  const control = obs.onGround || stepping ? 1 : MOTION.airControl;
  return {
    state: st,
    forward: f,
    jumpVelocity,
    blocked,
    impulse: { x: (given.x - v.x) * control, z: (given.z - v.z) * control },
  };
}

/**
 * One tick of horizontal movement with gravity off (ADR 0021). There is no
 * ground friction to estimate, so the impulse is pre-divided by the medium's
 * drag and applied in full. The handbrake does not exist in the air or under
 * water. Walls are detected per axis as on the ground (ADR 0003), against the
 * medium's wall drag. Step rise is handled by the aggregate.
 */
export function stepFlightMotion(
  prev: MotionState,
  input: DriveInput,
  v: Vec2,
  medium: Medium,
  limits: MotionLimits,
): MotionResult {
  // Without the cap, speed keeps climbing toward limits.maxSpeed under water
  // while clampLength hides it, and a released throttle coasts at full water
  // speed until speed falls back below maxWaterSpeed.
  const maxSpeed = Math.min(limits.maxSpeed, medium.maxSpeed);
  let speed = Math.min(
    updateSpeed(prev.speed, input.throttle, input.creep, limits),
    maxSpeed,
  );
  const yaw = steerYaw(prev.yaw, speed, input.steer, limits);
  const f = forward(yaw);
  const vLong = dot(v, f);
  const blocked =
    prev.airExpected !== undefined &&
    hitWall(
      v,
      prev.airExpected,
      (medium.wallDrag ?? medium.drag) * MOTION.blockedRatio,
    );
  if (blocked) speed = speedAfterWall(speed, vLong, limits);
  const keepLat = 1 - limits.grip;
  const target = clampLength(
    {
      x: f.x * speed + (v.x - f.x * vLong) * keepLat,
      z: f.z * speed + (v.z - f.z * vLong) * keepLat,
    },
    maxSpeed,
  );
  const given = {
    x: target.x / medium.drag,
    z: target.z / medium.drag,
  };
  return {
    state: {
      ...prev,
      speed,
      yaw,
      expected: undefined,
      airExpected: given,
      stepTicks: 0,
    },
    forward: f,
    jumpVelocity: 0,
    blocked,
    impulse: { x: given.x - v.x, z: given.z - v.z },
  };
}
