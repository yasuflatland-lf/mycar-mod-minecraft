# 0023. Make the vehicle item and the headlight switch work on mobile, and light the road three times farther

- Status: Accepted
- Date: 2026-10-11

## Context

On a phone joined to the dev BDS (1.26.52), neither item did anything (manual test, 2026-10-11). Logging every related event showed why:

- A tap on the top of a block with the vehicle item (0008) fires `world.beforeEvents.playerInteractWithBlock` (`isFirstEvent` true) but never the after-event the script listened to. The after-event only fires when the interaction did something, and an item with no use behavior does nothing on a block
- A tap in the air with the headlight switch (0020) fired no event at all. A long press fired `itemUse` once
- After giving the switch `minecraft:use_modifiers` (`use_duration` 0.1 s), a tap fires `itemUse`, but a touch held for even a moment repeats it every 4 to 6 ticks. With the 5-tick cooldown of 0020 measured from the last flip, one touch flipped the headlights two or three times, so whether they ended up on was chance

The in-game tests did not catch this because they cannot use an item without a player (0020).

The driver also asked for the light to reach three times as far, ahead of the vehicle only. 0020 lit cells 4 and 9 blocks ahead.

## Decision

- Placing a vehicle listens to `world.beforeEvents.playerInteractWithBlock` instead of the after-event, with the same filters (first event, vehicle item, top face). Before-events cannot change the world, so the placement runs on the next tick through `system.run`, as painting does (0017). The interaction is not cancelled
- The headlight switch gets `minecraft:use_modifiers` with `use_duration` 0.1 s and `movement_modifier` 1.0, so a tap counts as a use and holding it does not slow the player
- The switch flips only when it has been idle for `SPEC.headlightSwitchCooldown` (now 10 ticks) since the driver's previous use, whether or not that use flipped it. A burst of repeated uses from one touch flips once; two taps need half a second between them. This replaces the cooldown rule of 0020
- `SPEC.headlightReach` becomes 4, 9, 15, 21, and 27 blocks ahead of the vehicle's center: three times the old 9, still in a single line straight ahead. A level-15 light block every 6 blocks keeps the road between them at level 12 or brighter

## Consequences

- Both items work with a tap on mobile. On PC, right-click keeps working through the same events
- Each moving vehicle with its headlights on now rewrites up to ten blocks per tick instead of four. The revisit condition of 0020 (many vehicles driving at night on one server) comes sooner
- The cells stay one block above the ground the vehicle stands on (0020). On a slope, the far cells can end up inside the ground, where no light is placed, or high above a dip. Revisit by following the terrain if this shows on real roads
- A driver who taps the switch twice within half a second only flips it once
- The item handling is still covered only by unit tests and the manual test
