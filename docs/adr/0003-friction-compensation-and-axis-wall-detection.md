# 0003. Estimate and compensate for ground friction, and detect wall collisions per axis

- Status: Accepted
- Date: 2026-10-10

## Context

With the approach in 0002, the engine's ground friction scales the velocity the script gives by about 0.69 every tick. In the spike, without compensation the vehicle reached only 40% of the commanded speed.

Estimating the decay rate from the ratio of the current velocity to the velocity given in the previous tick, and adding the difference back, made the vehicle drive at the commanded speed. But when it hit a wall, the slowdown caused by being unable to move forward was mistaken for "friction got stronger", and the compensation became excessive. The leftover sideways velocity then grew every tick, and the vehicle slid along the wall at full speed.

## Decision

- Estimate the decay rate from the fraction of the previous tick's velocity that remains in the direction it was given. Clamp the estimate to 0.5–1 and update it with an exponential moving average (weight 0.2 on the new value)
- The engine zeroes velocity per axis when it hits a wall, so detect collisions separately on the x and z axes: an axis is colliding if the fraction of the given velocity that remains on it is less than half the estimate. Skip an axis when the velocity given on it is 0.03 or less
- While colliding, stop updating the decay estimate and lower the internal speed to the actual forward speed. After lowering it, still clamp it at the reverse limit (-0.2), because a backward actual forward speed could push the internal speed below the reverse limit

## Consequences

- The vehicle stops when it hits a wall, and its speed along the wall stays around the along-wall component it had just before impact (a maximum of 0.32–0.46 in the spike's automated measurements)
- Situations that are not walls but slow the vehicle a lot, such as slopes or pushing mobs, may be misdetected as collisions. In that case the internal speed just drops; the vehicle does not run away
- If the decay estimate stays lower than the real value, sideways velocity may grow instead of shrink. This property is checked with property-based tests (0010)
