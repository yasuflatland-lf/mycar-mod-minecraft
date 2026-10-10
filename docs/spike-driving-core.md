# Driving-core spike: findings

The spike was throwaway code built to choose how to drive vehicles. It was never merged, and its code has been discarded. The ADRs cite its measurements as evidence, so this page is now the only record of them. Two parts carried over into the driving core: the model generator became `tools/gen_model.py`, and the automated measurements below were replaced by in-game tests that judge pass or fail (0010).

## Questions

1. Can `getMovementVector()` be read while riding, on both PC and mobile? Is mobile left/right input analog?
2. With script-driven movement (approach 1), is the driver's camera smooth? How does the vehicle look to a passenger?
3. Do the engine's friction and gravity cancel the velocity the script gives? Can the vehicle climb steps?
4. Does it feel different from the horse approach (approach 2)?

Two vehicles were built for comparison:

| Entity | Approach | Look |
|---|---|---|
| `spike:car_script` | 1: the script computes velocity every tick and applies it with `applyImpulse` | Khaki SUV |
| `spike:car_horse` | 2: `minecraft:input_ground_controlled`, the same as a horse | Blue SUV |

## Automated measurements (BDS 1.26.52 in Docker)

| Test | What it does | Result |
|---|---|---|
| T1 | Accelerate straight, climb a one-block step, then coast | 95% of max speed after 39 ticks. Climbed the step. Coasted 22.76 blocks |
| T2 | Turn at full throttle (normal / handbrake) | Slip angle 13.8° / 52.4° |
| T3 | Drive into a cow ahead | Cow died from 12 damage and was pushed about 4 blocks (cause `entityAttack`) |
| T4 | Drive into a 4-block-high wall at 20° | Stopped in front of the wall. Speed along the wall peaked at 0.32 |
| T5 | Approach a two-block step head-on | Jumped 2.5 blocks before the step and landed on top |
| T6 | Approach a two-block step at 30° | The look-ahead at the vehicle's edge triggered the jump. Landed with 0.00 sideways drift |

## Findings

- **Friction needs compensation.** The engine's ground friction scales velocity by about 0.69 every tick, so without compensation the vehicle reaches only 40% of the commanded speed. Estimating the decay from the previous tick and adding it back makes the vehicle follow the command.
- **Walls must be told apart from friction.** If the slowdown from hitting a wall is mistaken for friction, the compensation runs away and the vehicle slides along the wall at full speed. Detect collisions per axis (x and z) by checking whether the given velocity almost vanished, and while colliding, drop the internal velocity to the actual velocity.
- **Steps.** `minecraft:variable_max_auto_step` handles one-block steps. Raising its limit does not get the vehicle over two-block steps, so the script looks ahead and makes it jump. When approaching at an angle the vehicle's corner hits first, so the look-ahead uses three lanes: the center line and both edges.
- **Ram damage.** Hits are detected in a rectangle ahead of the vehicle (the front of the visible body plus half the target's width), and `applyDamage` and `applyKnockback` are applied. Detection runs on the server, so at high speed a hit can land up to one tick before visual contact.
- **Self-damage.** With `minecraft:damage_sensor` on the vehicle, neither the driver nor the vehicle took damage from crashing into a wall or from a 10-block fall.
- **Facing.** A vehicle spawned with `/summon` has a fixed facing, so on mounting, the vehicle turns to match the driver's view. With `lock_rider_rotation: 90` on the driver seat, the camera follows the vehicle when it turns.
- **Model facing.** In Bedrock the front of an entity is the model's -z side. A model built facing +z must be rotated 180° on export.
- **Test caveats.** Mobs spawned with `dimension.spawnEntity` are removed within one tick when they are far from players (`summon` is not affected). `fill` is limited to 32,768 blocks per call.

## Manual test results (mobile)

| Item | Result |
|---|---|
| Input while riding | Available. Left/right is analog (`x=0.09`, `0.81`, and so on) |
| Single joystick | Steering hard lowers the throttle (`y=0.48` at `x=0.90`). The compensation is decided in the design (0005) |
| Camera | Follows the vehicle when it turns |
| Two-block steps | Climbed naturally, both head-on and at an angle |
| Ram damage | Pigs and cows take damage and are pushed aside |
| Self-damage | No hearts lost from crashing into a wall or from a fall |
| Turning with approach 2 (horse) | Left/right input slides the vehicle straight sideways (crab walking). It cannot turn like a car |

## Requirements carried into the design

- Driving: arcade-style acceleration, inertia, and sliding. Jump is the handbrake
- Steps: climbs up to two blocks. Three or more blocks stop the vehicle like a wall
- Collisions: the occupants (driver and passengers) and the vehicle take no damage from crashes or falls. Whatever the vehicle hits takes damage that scales with speed and is pushed aside
- Body: four-door off-road SUV, khaki, right-hand drive, four seats. Occupants sit inside
- Exterior: round headlights, a grille with vertical slots (eight; seven is a Jeep trademark, so avoid it), turn signals, fog lights, side mirrors, a spare tire on the back, a muffler at the rear right
- Interior: round steering wheel, two gauges, shift lever, rear-view mirror
- Effects: spinning wheels, exhaust while riding
- Not built in the spike: a door opens with a sound when getting out (make each door its own bone, such as `door_fl`)

## Open at the end of the spike

- Rating the smoothness of the driver's camera on a 5-point scale
- Testing on PC (keyboard), and how the vehicle looks to a passenger (needs two players connected)
- The handbrake lets the vehicle exceed max speed (0.897 against a max of 0.6)
- Collision boxes can only be square when seen from above, so the front and back of the roughly 3.3-block-long body stick out of the 1.8-block box and look sunk into walls
- Whether the exhaust comes out on the correct side (left/right of the locator)
