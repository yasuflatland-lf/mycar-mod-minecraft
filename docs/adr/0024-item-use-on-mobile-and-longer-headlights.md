# 0024. Make the vehicle item and the headlight switch work on mobile, and light the road three times farther

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

- Placing a vehicle listens to `world.beforeEvents.playerInteractWithBlock` instead of the after-event, with the same filters (first event, vehicle item, top face). Before-events cannot change the world, so the placement runs on the next tick through `system.run`, as painting does (0017)
- The before-event is cancelled, so a tap with the vehicle item on a chest, crafting table, door, or lever does not also open or toggle it
- The command carries the hotbar slot the item was used from. Outside Creative, the placement takes one item from that slot before it spawns the vehicle, and spawns nothing if the slot no longer holds one. Otherwise a player who switched slots or dropped the item during that tick would get a vehicle and keep the item
- Adventure mode players can place vehicles too; only Creative skips taking the item
- The headlight switch gets `minecraft:use_modifiers` with `use_duration` 0.1 s and `movement_modifier` 1.0, so a tap counts as a use and holding it does not slow the player
- The switch flips only when it has been idle for `SPEC.headlightSwitchCooldown` (now 10 ticks) since the driver's previous use, whether or not that use flipped it. A burst of repeated uses from one touch flips once; two taps need half a second between them. This replaces the cooldown rule of 0020
- `SPEC.headlightReach` becomes 4, 9, 15, 21, and 27 blocks ahead of the vehicle's center: three times the old 9, still in a single line straight ahead. The light blocks sit one block above the vehicle's feet, so midway between two of them 6 blocks apart the road surface is 4 steps away and gets level 11; heading diagonally, the floored cells spread up to 8 steps apart and the midpoint gets level 10

## Consequences

- Both items work with a tap on mobile. On PC, right-click keeps working through the same events
- Each moving vehicle with its headlights on now rewrites up to ten blocks per tick instead of four. The revisit condition of 0020 (many vehicles driving at night on one server) comes sooner
- The cells stay one block above the ground the vehicle stands on (0020). On a slope, the far cells can end up inside the ground, where no light is placed, or high above a dip. Revisit by following the terrain if this shows on real roads
- A driver who taps the switch twice within half a second only flips it once
- A tap with the vehicle item on the top of any block never opens or uses that block, even when there is no room for the vehicle
- When a light cell's chunk is unloaded, `Dimension.getBlock` may return `undefined` instead of throwing. Clearing now keeps such a cell for a later tick in both cases; before, an `undefined` counted as cleared and could leave the light block behind, which the longer reach makes more likely
- The item handling is still covered only by unit tests and the manual test
