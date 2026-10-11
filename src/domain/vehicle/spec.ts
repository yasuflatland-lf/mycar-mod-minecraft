// Vehicle tuning values. See docs/adr/0002-0008 for the rationale.
export const SPEC = {
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
  mountAlignSpeed: 0.01, // Below this speed, align the vehicle with the driver's view on entry
  // Friction and walls (ADR 0003)
  defaultFriction: 0.69,
  frictionMin: 0.5,
  frictionMax: 1,
  frictionEma: 0.2,
  airFriction: 0.91,
  airControl: 0.2,
  blockedAxisMin: 0.03,
  blockedRatio: 0.5,
  minExpectedForFriction: 0.05,
  // Steps (ADR 0004)
  hitboxFront: 0.9,
  carHeight: 1.6,
  stepVelocity: 0.75,
  oneStepVelocity: 0.45, // Peaks about 1.4 blocks up; 0.42, a player's jump, peaks at 1.25 (ADR 0035)
  stepTicks: 10,
  stepMinSpeed: 0.15,
  stepLookaheadTicks: 4,
  stepLookaheadMargin: 0.3,
  stepLaneOffset: 0.8,
  stepScanStep: 0.2,
  // Input (ADR 0018)
  throttleDeadzone: 0.1,
  throttleFullAt: 0.5,
  sidewaysAngle: 20, // degrees from horizontal within which the stick only steers and creeps
  creepSpeed: 0.12, // Below ramMinSpeed, so creeping never rams (ADR 0006)
  // Collisions (ADR 0006)
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
  // Placing and picking up vehicles (ADR 0008)
  hitsToBreak: 3,
  hitResetTicks: 100,
  // Headlights (ADR 0020)
  headlightReach: [4, 9, 15, 21, 27], // blocks ahead of the vehicle's center, one light block each; 6 apart, the road surface between them stays at level 10 or brighter (ADR 0024)
  headlightSwitchCooldown: 10, // ticks of idle switch; a held touch repeats the use every 4-6 ticks on mobile (ADR 0024)
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
  // Submarine (ADR 0039)
  maxWaterSpeed: 0.5, // blocks/tick
  // Placeholders until the submarine in-game tests measure drag.
  waterDrag: 0.8,
  waterVerticalDrag: 0.8,
  floatDraft: 1.2, // blocks; leaves 0.4 blocks of roof above the surface.
  surfaceRise: 0.05, // blocks/tick; caps buoyancy both up and down
  floatGain: 0.25, // blocks/tick of buoyancy per block of depth off the float line
  waterBreathingInterval: 20, // ticks
  waterBreathingTicks: 60, // ticks
  // Banking in flight (ADR 0026)
  maxBank: 30, // degrees at the full turn rate
  bankRate: 3, // degrees/tick; 10 ticks from level to full bank
  // Landing gear (ADR 0033). Unfolding takes 1 s (ADR 0022), 3 blocks of
  // landing at landingSink, so the wheels come down a block above that.
  gearDownHeight: 4, // blocks of air below the vehicle within which landing unfolds the wheels
  gearProbeOffset: 0.8, // blocks from the center to the probed corners, inside the 1.8-block hitbox
  bankSink: 0.03, // blocks/tick of altitude lost at full bank
} as const;
