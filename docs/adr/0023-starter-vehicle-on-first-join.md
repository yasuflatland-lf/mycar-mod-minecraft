# 0023. Give each player a vehicle item on their first join

- Status: Accepted
- Date: 2026-10-11

## Context

In survival, the only way to get a vehicle is to craft its item (0008). The current recipe (`packs/mycar_bp/recipes/suv_item.json`) takes 5 iron ingots, 1 iron block, and 2 coal blocks: 14 iron ingots and 18 coal in all. That takes long enough that a new player on the home LAN server cannot drive for a while. We compared making the recipe cheaper, for example from wood, with handing each player a vehicle item without crafting. A cheap recipe still needs a crafting table and has to avoid the shapes of vanilla wood recipes. A broken vehicle drops its item again (0008), so one item is enough to keep a vehicle for good.

## Decision

- When a player joins the world for the first time, put one vehicle item in their inventory. If it is full, drop the item at their feet
- The script listens to `world.afterEvents.playerSpawn` with `initialSpawn`. That is true on the first spawn of every session, not only the first join ever, and false on a respawn after death, so the player's dynamic property `mycar:starter_received` remembers that they got the item, and later joins give nothing
- Players who joined before this change get the item on their next join, and players in creative mode get it as well
- Crafting (0008) stays, so more vehicles can still be crafted

## Consequences

- A new player can drive right away, and the crafting cost of 0008 only applies to extra vehicles
- A player who loses the item (for example by dying with it in a lava pit) does not get another one; they craft it or ask an operator for `/give`
- The dynamic property lives in the player data of the world. A new world, or deleting a player's data, gives the item again
- The in-game tests have no players, so joining is covered by unit tests of the use case and the manual test
- Revisit when the Workstation recipe of sub-project 3 changes what a vehicle costs, or if players often lose their only item
