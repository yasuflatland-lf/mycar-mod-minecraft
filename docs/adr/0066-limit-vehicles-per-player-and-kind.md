# 0066. Limit vehicles per player and per kind

- Status: Accepted
- Date: 2026-10-13
- Supersedes: 0038
- Supersedes in part: 0051 (counting boats under the world limit of 10)

## Context

0038 keeps at most 10 vehicles per world across all players and kinds, and 0051 counts sports boats in the same 10. On a shared server, one player's placements remove another player's vehicles, and a player can hold ten boats. 0038 already said to revisit the decision if players want a limit per player.

Vehicles have no owner today. Vehicles summoned by command, including all vehicles in the in-game tests (0010), have no placing player. The test pack cannot write the add-on's entity dynamic properties because dynamic properties are scoped to the pack that wrote them.

## Decision

- A vehicle placed from its item records the placing player's `Player.id` as its owner in the entity dynamic property `yasu_ride:owner`. Nothing else writes it, and it never changes
- The fleet stays in the world dynamic property `yasu_ride:fleet`, oldest first, and stores each vehicle's id, kind, and owner if any
- Vehicles with an owner are limited per owner and per kind. Each kind's limit lives in its profile as `fleetLimit` (0050): 10 for the SUV and 1 for the sports boat. Placing one more removes that owner's oldest vehicle of that kind, with the eviction rules of 0038: removed as soon as it is loaded, riders dismounted, no item dropped, and headlight blocks cleared
- Vehicles with no owner, whether summoned by command or placed before this change, share one world-wide group across all kinds, limited to 10 (`SPEC.maxUnownedVehicles`). This keeps 0038's behavior for them and for the in-game tests
- The evicted list stays world-wide, capped at 64 (`SPEC.maxEvicted`)
- A fleet stored by an earlier build (`{"order": [...], "evicted": [...]}` with plain ids) keeps its evicted list and drops its order. The dropped vehicles join again as the oldest of their group, with their real kind and owner, the next time they load or the script starts
- Everything else in 0038 still holds: how vehicles join (spawn as newest, found as oldest), eviction of unloaded vehicles, and a vehicle broken by hand leaving the fleet

## Consequences

- A player can no longer lose a vehicle because another player placed one
- The world can hold up to 11 vehicles per player plus 10 unowned ones, so the number of vehicles grows with the number of players. Revisit these limits if that growth becomes too costly for the shared server
- A player's second sports boat removes their first one, even while someone rides it
- The owner is a `Player.id`, which must stay the same when the player leaves and rejoins. Check this with a manual test row
- Limits per owner are covered by unit tests and manual tests, not by in-game tests, because the test pack cannot set an owner
- Ownership changes nothing else: anyone can still ride, paint, or break any vehicle
