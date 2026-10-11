# 0020. Headlights that light up the road

- Status: Accepted
- Date: 2026-10-11
- Amended by: [0024](0024-item-use-on-mobile-and-longer-headlights.md) (switch cooldown and reach)

## Context

Driving at night is hard because the vehicle's lamps are only painted on. We want the driver to switch the headlights on and off, and the road ahead to get brighter while they are on.

Switching needs an input a rider can give on both PC and mobile. Jump is the handbrake (0005) and sneak gets out of the vehicle, and the stable Script API (0001) exposes no other buttons. A custom slash command works, but on mobile it means opening the chat and typing. Using an item works the same way on both: right-click on PC, tap on mobile.

An entity cannot emit block light. The only way to light up the world with the stable API is to place light blocks. `minecraft:light_block_15` has no collision, is invisible unless the player holds a light block, and can be replaced by any block; BDS accepts it (in-game test `headlights_follow_and_clear`, 2026-10-11).

## Decision

- A new item, the headlight switch (`mycar:headlight_switch`), is crafted shapeless from a lever and glowstone dust. Using it while riding a vehicle switches that vehicle's headlights. The script listens to `world.afterEvents.itemUse`, and also to `world.beforeEvents.playerInteractWithEntity` when the rider aims at the vehicle they ride; that interaction is cancelled so it does nothing else
- Only the driver (0019) can switch them. A switch within `SPEC.headlightSwitchCooldown` (5 ticks) of the last one is ignored, so one tap that reaches the script through both events counts once
- The state lives in the entity property `mycar:headlights` (bool, default `false`, `client_sync`), so it survives `/reload` and restarts. A placed vehicle starts with them off
- While they are on, the script keeps a `minecraft:light_block_15` in each cell `SPEC.headlightReach` (4 and 9 blocks) ahead of the vehicle's center, one block above the ground it stands on. Every tick it clears the cells it lit that are no longer wanted and lights the new ones. It only places a light block in air, and only clears a cell that still holds a light block, so it never removes a block a player built
- The cells a vehicle lit are saved in its dynamic property `mycar:lit_cells`, so they can be cleared after a `/reload` or a restart. They are also cleared when the vehicle is broken (0008) or stops being loaded
- Light blocks count as air for the step-up look-ahead (0004) and for placing a vehicle (0008), so a vehicle never climbs or refuses its own light
- The lamp lenses (cubes with the `light` swatch: headlights and fog lamps) move from `body` to a new bone `headlights`, a child of `body`. The `light` swatch has alpha 0 in every paint texture. The render controller gives the `headlights` bone the material `entity` (ignores alpha) while the headlights are off and `entity_emissive` (alpha 0 is fully lit) while they are on

## Consequences

- The road ahead is lit at night, and the lamps glow even in the dark
- `headlights` joins the bone names of 0009. A Blockbench model needs that bone, and an emissive mask in the alpha channel of its lamp texels
- A vehicle that vanishes without being broken while its chunk is unloaded (for example `/kill` far from players) can leave its light blocks behind. They are invisible and harmless, and any block placed there replaces them
- Each moving vehicle with its headlights on rewrites up to four blocks per tick, which makes the engine recompute light. Revisit the reach or the cell count if many vehicles drive at night on a server
- The in-game tests cannot use an item without a player, so they set the property directly; the item handling is covered by unit tests and the manual test
