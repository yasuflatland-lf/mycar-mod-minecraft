# 0032. Lower the wheels before touchdown

- Status: Accepted
- Date: 2026-10-11
- Supersedes in part: 0022 (when the wheels unfold)

## Context

In 0022 the animation controller unfolds the wheels when `mycar:flight` returns to `ground`, so the SUV lands on its folded wheels and only then turns them back over 1 second. The wheels should be in the driving pose when the vehicle touches the ground, the way an airplane lowers its gear on approach.

The client cannot see how far the ground is below the vehicle. The script can: it already reads blocks around the vehicle for steps (0004). Landing sinks at 0.15 blocks/tick (0021), so the 1-second unfold covers 3 blocks of descent.

## Decision

- The `Vehicle` aggregate keeps a landing gear flag. It is down on the ground and up in takeoff and flight. While landing it comes down once a solid block lies within `SPEC.gearDownHeight` (4) blocks below the center or one of four corners `SPEC.gearProbeOffset` (0.8 blocks) out along the vehicle's axes, and then it stays down until the mode changes, so a dip under the vehicle does not fold the wheels again. The blocks are probed only while landing with the gear up
- The flag goes to the client through the bool entity property `mycar:gear_down` (default `true`, `client_sync`), written on the first tick of an aggregate and after that only on the ticks it changes, as the bank is (0026)
- The animation controller moves from `ground` to `deploy` when the gear goes up and from `hover` to `retract` when it comes down. The render controller shows the `glow_*` discs only while the gear is up, so they do not hang under the unfolding wheels. The rear glass still follows `mycar:flight` (0026)

## Consequences

- A landing from higher than about 4 blocks finishes unfolding about a block above the ground. A landing that starts lower unfolds at once and touches down before the unfold ends, as before
- The hover sound and glow stop when the wheels start to unfold, a moment before touchdown
- Landing on water or lava finds no solid block, so the wheels unfold only when the mode returns to `ground`
