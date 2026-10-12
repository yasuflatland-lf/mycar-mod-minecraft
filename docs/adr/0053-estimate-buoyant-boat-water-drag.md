# 0053. Estimate the buoyant boat's water drag

- Status: Accepted
- Date: 2026-10-12

## Context

0051 floats the sports boat with `minecraft:buoyant` and pre-divides the script's horizontal velocity by a water drag of 0.83, the submarine's value measured with gravity off. The spike measured that this hull did not follow its target speed, so 0051 left the drag to be measured.

The in-game test `boat_drag` measures it on the dev BDS: a pool 3 blocks deep, the boat heading +z, full throttle for 80 ticks, then 12 ticks of coasting. The test pack cannot read the impulse the main pack gives, so it runs the same `BoatDrive` on the observed velocity, one tick behind the input it sends, because the main pack acts on a script event one tick after it is sent. The ratio is the observed horizontal velocity projected on the velocity given the tick before. Ticks below count the test's loop index t: the throttle is on for t = 1–80, and the log labels each row t + 1, the tick on which its velocity is observed.

| Phase | Ratio |
|---|---|
| First two ticks of throttle (given under 0.06) | 1.000, 0.955 |
| Accelerating, given 0.1–1.1 | 0.87 falling to 0.837 |
| Full speed, 10 of every 14 ticks | 0.833–0.834 |
| Full speed, 3 ticks at the top of each bob (feet about 0.39 below the surface) | 0.916–0.927 |
| Full speed, the tick after those | 0.815–0.819 |

Across throttle ticks 5–80 (76 samples) the ratio has a mean of 0.854 and a spread (maximum minus minimum) of 0.114. The feet cell held water on every tick, 0.36–0.53 blocks below the surface, so there are no out-of-water samples: the bumps come from the bob, not from leaving the water.

With the fixed 0.83 the boat held 1.140 blocks/tick over ticks 60–80 (21 samples), above its 1.12 target, because the bob bumps add speed the fixed value does not take back. The spike's cap near 1.02 blocks/tick and its slowdown to 0.355 in a full turn did not reproduce with the drive from 0051; their cause was not investigated.

## Decision

- The spread of 0.114 is over the 0.05 that would allow one constant, so estimate the drag every tick with an exponential moving average, as 0003 estimates ground friction
- The boat's own constants in `boatDrive.ts` (`SPORTSBOAT_DRAG`): initial value 0.83 (the steady ratio), minimum 0.7, maximum 0.95 (above every ratio measured once the given velocity passes 0.06; of the first two throttle ticks, 1.000 and 0.955, one whose given velocity passes 0.05 is sampled and clamped to 0.95), weight 0.1 on each new sample, and no sample while the given velocity is 0.05 blocks/tick or less. With the weight at 0.1, one three-tick bob bump raises the estimate by about 0.02
- Each sample is clamped to the bounds before it is averaged. The per-axis wall check of 0003 runs against the estimate the tick starts from, and its decision is shared: a tick on which it fires is not sampled, and `stepFlightMotion` checks walls against the same estimate (`Medium.wallDrag`). So a tick is a drag sample or a wall hit, never both, and a collision is not taken for drag
- The estimate lives in the motion state (`waterDrag`), stays unchanged while the boat is beached, and the estimate updated on a tick is the drag `stepFlightMotion` divides by on that tick
- `boat_cruise` asserts the two targets of issue #149: a steady speed over throttle ticks 51–70 of at least 0.95 × 1.12 = 1.064 blocks/tick, and, after 55 ticks of throttle, a full right turn at full throttle whose last five ticks keep at least 0.8 of the speed of ticks 51–55

## Consequences

- Measured with the estimator: the estimate settles at 0.843–0.864 at full speed. `boat_drag` holds 1.109 blocks/tick over ticks 60–80; `boat_cruise` holds 1.113, enters the turn at 1.097, turns 360 degrees in 60 ticks at 6.000 degrees/tick, falls no lower than 1.058, and leaves the turn at 1.130 (1.030 of the entry speed)
- The estimate lags the bob, so the speed still rises by about 0.1 for three ticks of every 14
- A slowdown that is not a wall but trips the wall check, such as pushing a mob, freezes the estimate and lowers the internal speed instead of raising the compensation (0003)
- The driver still has to ride the boat and confirm that the top speed and the turning feel right
