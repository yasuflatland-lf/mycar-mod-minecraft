# 0034. Return to the ground when a flying vehicle sinks onto it

- Status: Accepted
- Date: 2026-10-11
- Supersedes in part: 0021 (how flight ends)

## Context

With the stick pulled back to sink (0032), a driver can fly the SUV down onto the ground. In 0021 only a double tap or a missing driver leaves `flying`, so a vehicle sitting on the ground stayed in flight: gravity stayed off, the wheels stayed folded, and the riders kept the third-person camera (0028). Players expected touching the ground to end the flight, as it does for a player flying in Creative.

The `flight_touchdown` in-game test showed that `Entity.isOnGround` turns true when a vehicle with gravity off sinks onto a block.

## Decision

- A `flying` vehicle that is on the ground goes straight to `ground` on that tick, without `landing`. This takes precedence over a double tap or a missing driver on the same tick
- Everything that follows a change to `ground` follows as usual: the `mycar:land` event turns gravity back on (0021), the wheels unfold (0022, 0033), and the riders get their own camera back (0028)

## Consequences

- Sinking onto the ground ends the flight, so skimming over the ground means staying above it. To fly again, double-tap Jump to take off
- The wheels unfold after this touchdown, not before it, because `landing`, where 0033 lowers them early, is skipped
- The bank sink (0026) counts too: a full-lock circle from the 1.5-block takeoff height touches down in about 56 ticks (2.8 s) and ends the flight. A driver who circles low holds Jump
- Flying into the side of a block does not count as touching the ground: the engine treats it as a wall, and the vehicle keeps flying
