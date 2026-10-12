# 0059. Sports boat wake, bow rise, and roll

- Status: Superseded in part by [0061](0061-lift-the-bow-and-roll-further.md)
- Date: 2026-10-12

## Context

The sports boat (0051) sits level on the water whatever it does, and nothing shows the jets working. A wake boat lifts its bow while it gains speed, settles once it planes, leans into turns, and leaves foam behind its jets. The SUV already shows the matching patterns: the script steps a bank angle each tick and sends it as a synced float property that a client animation reads (0026), and an always-on animation emits exhaust particles at a locator.

The client can read `query.ground_speed`, which the SUV's engine sounds already use. It cannot read acceleration or turn rate without keeping state of its own in Molang, which the unit tests cannot reach.

## Decision

- Step two angles in the domain, in `kinds/sportsboat/attitude.ts`, and send them as synced float properties `yasu_ride:trim` (0 to 7 degrees) and `yasu_ride:roll` (-10 to 10 degrees), each only when it changes. The first tick always sends both, so a rebuilt vehicle clears what the entity kept from before `/reload`, as the SUV does with its bank
- Trim: afloat, the target is `maxTrim` (7) times the forward speed gained this tick divided by the boat's `accel`, clamped to 0..1. Reversing, slowing, holding speed, or running aground gives 0. It moves toward the target by at most 0.5 degrees per tick going up and 0.25 going down, so at full throttle the bow is fully up in about 0.7 s and settles about 1.4 s after top speed
- Roll: afloat, the target is `maxRoll` (10) times the heading change divided by `turnRate` and times the speed divided by `maxSpeed`, each clamped. Positive lowers the right side when the heading turns right, as the SUV's bank does (0026). Aground it is 0. It moves by at most 1 degree per tick
- One client animation, `animation.yasu_ride.sportsboat.attitude`, always on, turns the `root` bone by `trim` on x and by minus `roll` on z, so no bone is driven by two animations at once (0022). The root pivot moves to the aft third at the waterline, 20 px aft of the middle and 7 px up, so the bow lifts and the stern squats a little
- `animation.yasu_ride.sportsboat.wake` runs while `query.has_rider && query.ground_speed > 2`. Every 0.1 s it emits `yasu_ride:jet_bubbles` (small bubbles that rise and fade within a second) and `yasu_ride:jet_foam` (white puffs that grow and fade over 1.2 to 1.8 s) at the `jet_left` and `jet_right` locators on the nozzle bores. Both use the vanilla particle atlas

## Consequences

- The boat gains two entity properties. The Behavior Pack entity and the Resource Pack version (0.1.44) change together (0015)
- The particles are emitted in world space, so the foam stays behind as a trail while the boat moves on
- Riders stay level while the hull pitches and rolls by up to 7 and 10 degrees, as they do while the SUV banks
- The wake depends on the client's `query.ground_speed`, so a boat pushed along by something else while ridden also shows a wake
- Still to check in game: that a positive x rotation of the root bone lifts the bow and a negative z rotation lowers the right side, and how the particles look on and under the water. If a sign is wrong, flip it in the animation, not in the domain
