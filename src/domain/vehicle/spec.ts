// Tuning values the vehicle core reads (ADR 0055). See docs/adr/0002-0008 for the rationale.
export const SPEC = {
  // Input (ADR 0018)
  throttleDeadzone: 0.1,
  throttleFullAt: 0.5,
  sidewaysAngle: 20, // degrees from horizontal within which the stick only steers and creeps
  // Collisions (ADR 0006)
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
  headlightSwitchCooldown: 10, // ticks of idle switch; a held touch repeats the use every 4-6 ticks on mobile (ADR 0024)
  waterBreathingInterval: 20, // ticks
  waterBreathingTicks: 60, // ticks
  // Vehicle limit (ADR 0038)
  maxVehicles: 10, // per world, across all players and dimensions
  maxEvicted: 64, // evicted vehicles remembered until their chunk loads; one dropped from the list joins again as the oldest when it loads
} as const;
