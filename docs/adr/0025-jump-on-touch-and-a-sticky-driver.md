# 0025. Keep a touch rider's Jump from dismounting them, and keep the driver while they ride

- Status: Accepted
- Date: 2026-10-11

## Context

Jump pulls the handbrake (0005) and a double tap of Jump toggles flight (0021). On a phone (BDS 1.26.52, Creative and Survival), one press of Jump while riding the SUV dismounted the rider on the next tick (manual test, 2026-10-11). Neither the handbrake nor flight could be used from touch. The in-game tests feed Jump through test input instead of a player, so they did not catch this.

Tried on the phone, one server restart each:

| Components added to the entity | Jump dismounts | Double tap takes off |
|---|---|---|
| `minecraft:can_power_jump`, `minecraft:horse.jump_strength` 0 | yes | no |
| `minecraft:input_ground_controlled` only | yes | no |
| all three | no | yes |

With all three, Jump reaches the script as `InputButton.Jump` and the rider stays seated. `minecraft:movement` stays 0, so the engine does not move the vehicle on its own, and driving felt unchanged.

Once flying worked, the vehicle sometimes started landing without a tap. Logging the rider's offset from the vehicle each tick showed the offset jump by about 0.5 blocks for a single tick while the vehicle moved. With the driver chosen each tick as the rider nearest seat 0 (0019), that tick had no driver, and a flying vehicle with no driver lands (0021).

## Decision

- The entity gets `minecraft:input_ground_controlled`, `minecraft:can_power_jump`, and `minecraft:horse.jump_strength` with value 0. `minecraft:movement` stays 0; the script still sets the velocity every tick (0002)
- A rider who is the driver stays the driver for as long as they ride the vehicle. Only when there is no driver, or the driver has left, is the driver chosen again as the rider nearest seat 0. This keeps 0019: when the driver leaves, the passenger the engine moves up to seat 0 becomes the driver

## Consequences

- From touch, Jump pulls the handbrake and a double tap toggles flight, in Creative too
- A one-tick misread of a rider's seat no longer drops the driver. Seat events for doors (0019) still come from the offsets
- If the very first tick a rider is seen misreads a passenger as seat 0 while nobody drives, that passenger stays the driver until they leave. This needs a misread on the tick of mounting and has not been seen
- `input_ground_controlled` lets the engine take the rider's input as movement; with movement 0 this has not shown any effect. Revisit if a future engine version starts moving or turning the vehicle by itself
- PC was not tested with these components; the manual test rows for the handbrake and flight cover it
