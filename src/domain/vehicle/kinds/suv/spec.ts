import type { Medium } from "../../motion/motion";

// The SUV's own tuning values (ADR 0055). See docs/adr/0002-0008 for the rationale.
export const SUV_SPEC = {
  // Driving (ADR 0002)
  maxSpeed: 0.9, // blocks/tick
  maxReverse: 0.2,
  accel: 0.0225,
  reverseAccel: 0.01125,
  brake: 0.04,
  drag: 0.02,
  turnRate: 6, // degrees/tick at full steering input
  steerFullSpeed: 0.08, // Full steering effect at or above this speed
  grip: 0.6,
  handbrakeGrip: 0.04,
  creepSpeed: 0.12, // Below SPEC.ramMinSpeed, so creeping never rams (ADR 0006)
  // Steps (ADR 0004)
  hitboxFront: 0.9,
  carHeight: 1.6,
  // Collisions (ADR 0006)
  bodyFront: 1.65,
  bodyHalfWidth: 1.0,
  // Headlights (ADR 0020)
  headlightReach: [4, 9, 15, 21, 27], // blocks ahead of the vehicle's center, one light block each; 6 apart, the road surface between them stays at level 10 or brighter (ADR 0024)
  // Flight (ADR 0021)
  doubleTapTicks: 8, // A second Jump press within this many ticks toggles flight
  takeoffTicks: 20,
  takeoffClimb: 0.075, // blocks/tick; 20 ticks lift the vehicle 1.5 blocks
  landingSink: 0.15, // blocks/tick
  maxClimb: 0.3, // blocks/tick, up or down, with Jump held or the stick pulled back (ADR 0032)
  // Engine drag per tick with gravity off. The flight_cruise in-game test
  // reports the measured horizontal value.
  flightDrag: 0.91,
  flightVerticalDrag: 0.98,
  // Submarine (ADR 0040)
  maxWaterSpeed: 0.5, // blocks/tick
  // Engine drag per tick in water with gravity off, as the submarine_dive
  // in-game test measured it (0.833 horizontal, 0.836 vertical).
  waterDrag: 0.83,
  waterVerticalDrag: 0.84,
  floatDraft: 1.2, // blocks; leaves 0.4 blocks of roof above the surface.
  // A floating submarine's feet sit fractionally into a shore step, so the
  // step top can be less than the half block above the feet where stepUp.ts
  // probes. Lowering the probe by this much starts it at the feet.
  submarineStepProbeDrop: 0.5, // blocks
  surfaceRise: 0.05, // blocks/tick; caps buoyancy both up and down
  floatGain: 0.25, // blocks/tick of buoyancy per block of depth off the float line
  // Banking in flight (ADR 0026) and under water (ADR 0044)
  maxBank: 30, // degrees at the full turn rate
  bankRate: 3, // degrees/tick; 10 ticks from level to full bank
  // Landing gear (ADR 0033). Unfolding takes 1 s (ADR 0022), 3 blocks of
  // landing at landingSink, so the wheels come down a block above that.
  gearDownHeight: 4, // blocks of air below the vehicle within which landing unfolds the wheels
  gearProbeOffset: 0.8, // blocks from the center to the probed corners, inside the 1.8-block hitbox
  bankSink: 0.03, // blocks/tick of altitude lost at full bank
} as const;

export const AIR: Medium = {
  drag: SUV_SPEC.flightDrag,
  maxSpeed: SUV_SPEC.maxSpeed,
};
export const WATER: Medium = {
  drag: SUV_SPEC.waterDrag,
  maxSpeed: SUV_SPEC.maxWaterSpeed,
};
