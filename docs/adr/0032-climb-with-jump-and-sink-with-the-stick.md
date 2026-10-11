# 0032. Climb with held Jump and sink with the stick pulled back

- Status: Accepted
- Date: 2026-10-11
- Supersedes in part: 0021 (the vertical speed while flying)

## Context

In 0021 the view pitch sets the vertical speed while flying: looking up climbs, looking down sinks. Players expected the view to be only a camera, as it is when they fly on their own in Creative, where holding Jump climbs and holding the descend button sinks. Looking at something below should not drop the vehicle.

The descend button is Sneak, and it cannot be used while riding: Sneak dismounts the rider, and on touch it reads as pressed for at most one tick (0021). Mojang's happy ghast also leaves crouch as the dismount button (Bedrock 1.21.90). The stable Script API cannot stop the dismount.

## Decision

- While `flying`, the climb command is `clamp((Jump held ? 1 : 0) + min(0, throttle), -1, 1)`, with the throttle from `toDriveInput` (0018). Holding Jump climbs, pulling the stick back (S on PC) sinks, and Jump with the stick pulled fully back holds altitude; with the stick only partly back, Jump still climbs. A sideways stick only steers and creeps, so it never sinks
- In the air a negative throttle is dropped from the drive input, so pulling the stick back sinks without braking or reversing. The vehicle coasts forward under drag
- The target vertical speed is `command * SPEC.maxClimb` (0.3 blocks/tick). It no longer depends on the forward speed, so a vehicle hovering in place climbs and sinks too. The bank sink of 0026 is still subtracted, and the sum is still capped at ±`SPEC.maxClimb`
- The view pitch is not read any more. `SPEC.pitchDeadzone` and the fifth field of the test input message are removed
- Takeoff and landing keep their fixed vertical speeds (0021)

## Consequences

- Looking up and down only moves the camera, in first and third person (0028), on PC and touch alike
- Two quick taps of Jump to climb a little still count as a double tap and start landing (0021). To climb, hold Jump instead of tapping it
- The vehicle cannot fly backward. Revisit if players need to back out of a tight spot in the air
- A long banked turn loses altitude (0026); the driver holds Jump to keep it
