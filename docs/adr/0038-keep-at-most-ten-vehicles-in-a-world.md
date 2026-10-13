# 0038. Keep at most ten vehicles in a world

- Status: Superseded by [0066](0066-limit-vehicles-per-player-and-kind.md)
- Date: 2026-10-11

## Context

Nothing limits how many vehicles a world holds. Each one runs the drive loop every tick (0002) and may keep light blocks for its headlights (0020), so forgotten vehicles pile up on the home LAN server. We want a fixed number per world, with a new vehicle pushing out the oldest one.

A script can only see and remove entities in loaded chunks, and `world.afterEvents.entityRemove` fires for chunk unloads as well as for removals, so it cannot tell a vehicle that is gone from one that is far away. Vehicles have no creation time, and the in-memory repository is lost on `/reload` (0012).

A first version admitted every vehicle it did not know yet from a scan every 10 ticks. The in-game test summoned 11 vehicles in one tick and lost all of them: the spawn events arrive after the tick, so the scan took the newly summoned vehicles for ones that had been there before, counted them as the oldest, and removed them.

## Decision

- A world keeps at most 10 vehicles (`SPEC.maxVehicles`), across all players and dimensions
- The fleet is the list of vehicles in the order they appeared, kept as JSON in the world dynamic property `mycar:fleet`, so the order survives `/reload` and restarts. Its repository interface lives in the domain, as `VehicleRepository` does (0012). A malformed value is logged and the fleet starts over
- A vehicle created from the item or by a command (`entitySpawn` with any cause but `Loaded`) joins as the newest. When the fleet goes over the limit, the oldest vehicle is evicted
- A vehicle the fleet never saw spawn joins as the oldest. The fleet looks for them once when the script starts, and then in `entityLoad` and `entitySpawn` with cause `Loaded`, skipping a vehicle an earlier event of the same load already removed. A world that had more vehicles before this change goes down to 10 this way, and a vehicle found later in a far chunk is the one removed rather than a newer one
- An evicted vehicle is removed as soon as it is loaded, even with riders; `Entity.remove()` dismounts them. It drops no item, and each removal is logged. Its headlight blocks are cleared, and the ones in chunks that are not loaded yet are retried every tick until they are, since nothing else asks for the vehicle again
- An evicted vehicle in an unloaded chunk stays in the evicted list until its chunk loads. The list keeps the latest 64 (`SPEC.maxEvicted`); a vehicle dropped from it joins again as the oldest when it loads
- A vehicle broken by hand (0008) leaves the fleet and frees its slot

## Consequences

- Placing an eleventh vehicle removes the oldest one, wherever it is and whoever owns it. A player can lose a vehicle they still use
- A vehicle that disappears in another way, such as `/kill`, stays in the fleet and takes a slot until newer vehicles push it out. Pushed out, it waits in the evicted list for a chunk that never loads, which is why that list has a cap
- The in-game test `vehicle_limit` summons 11 vehicles and checks that the first one is removed and the other 10 remain. Reading back a world that already had more than 10 vehicles is covered by unit tests of the use case
- The in-game tests summon many vehicles and remove them without telling the fleet, so a run evicts every vehicle already in the dev world, including far ones the next time their chunk loads. CI starts from a fresh world
- The retry of headlight blocks lives in memory, so a `/reload` before it finishes leaves those light blocks behind
- Revisit if players want a limit per player rather than per world
