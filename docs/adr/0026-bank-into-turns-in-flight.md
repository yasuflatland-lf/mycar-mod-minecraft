# 0026. Bank into turns in flight

- Status: Superseded in part by 0044 (banking under water)
- Date: 2026-10-11

## Context

In flight (0021) the SUV turns flat, like a car on a road. A turn in the air reads better when the vehicle rolls into it the way an airplane banks: left side down in a left turn, right side down in a right turn. Players cannot be rolled, and the hitbox and the riders' seats should stay where they are, so the roll is only a look.

The client cannot see the steering input. It could estimate the turn from the change of `query.body_y_rotation` between frames, but that depends on the frame rate and on how the client interpolates the heading. The script already knows how far the heading turned each tick.

## Decision

- The `Vehicle` aggregate keeps a bank angle in degrees, positive lowering the right side. While `flying`, its target is `clamp(heading change this tick / SPEC.turnRate, -1, 1) * SPEC.maxBank` (30°), so a turn at the full turn rate banks fully, whatever the speed or the direction of travel. In every other flight mode the target is 0. The angle moves toward the target by at most `SPEC.bankRate` (3°) per tick
- The angle goes to the client through the float entity property `mycar:bank` (`range` ±`SPEC.maxBank`, `client_sync`). The script writes it on the first tick of an aggregate, so a vehicle rebuilt after `/reload` clears a stale angle, and after that only on the ticks it changes
- The animation `animation.mycar.suv.bank` always runs and rotates the `root` bone by `-query.property('mycar:bank')` around z: a positive z rotation lowers the model's +x side, which is the vehicle's left (0022). A first version eased a `variable.bank` toward the property in `pre_animation` with `query.delta_time`; in game the model did not roll at all while the property changed on the server, so the animation reads the property directly. The 3° steps at 20 Hz are small enough
- While flying, the target vertical speed drops by `|bank| / SPEC.maxBank * SPEC.bankSink` (0.03 blocks/tick at full bank), still capped at `SPEC.maxClimb`, so a banked turn loses a little altitude the way an airplane's does
- Players cannot be rolled with the stable API; rolling them would mean overriding the vanilla player definitions in both packs. The riders stay upright, and the rear window, which the third-person camera (0028) looks through, is an opaque blue glass so the upright riders do not show inside the rolled body. The glass is its own bone, `rear_glass` (a child of `body`, extending the bone contract of 0009), and the render controller shows it only while `mycar:flight` is not `ground`, so on the ground the rear window is open as before
- The pivot of `root` moves from the ground to `[0, 12, 0]`, inside the body, so the body rolls about its middle instead of swinging sideways from the wheels' contact patch. Nothing else rotates `root`

## Consequences

- Riders stay upright while the body rolls under them. They are hidden from behind, but still show through the open side windows and the windshield
- The rolled model can poke slightly out of the collision box; collisions stay those of the level box
- The property adds one network update per tick while the angle changes, and none in a steady turn or level flight
- A model made in Blockbench must keep `root` with its pivot inside the body
