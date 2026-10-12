// Kind-neutral hold pose and collision floor cells for a stopped vehicle (ADR 0063).
export interface HoldPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

export interface FloorCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Collision height in pixels, 1..16. */
  readonly height: number;
}
