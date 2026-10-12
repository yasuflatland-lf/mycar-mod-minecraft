# Sports boat deck spike: findings

The spike was throwaway code on `spike/boat-deck-walk`, built to find out how players can walk on a stopped sports boat, choose a seat, and set off. Its code was not merged. This page records the measurements and manual findings from the dev BDS 1.26.52 on 2026-10-12, following the [sports boat spike](spike-sportsboat.md). The implementation decisions are in [0063](adr/0063-walk-on-a-stopped-sports-boat.md).

## Questions

1. Can collision blocks support a player at the model's deck height without replacing water?
2. Can the boat stay still above its own floor, then float normally when it leaves?
3. Can a player standing on the deck choose a seat on PC and touch devices?
4. What state must survive `/reload` and a server restart?

## Measurements (dev BDS 1.26.52, 2026-10-12)

| Test | Result |
|---|---|
| Deck support | A custom block with a `minecraft:collision_box` of height h/16, one permutation per h from 1 to 16, laid under the hull supported armor stands at boat y + 9.3/16 in the cockpit and y + 11.3/16 in the bow. These match `DECK = 9.0` and `DECK_BOW = 11.0` in [the model generator](../tools/gen_sportsboat.py), with 0.3 px of teak on top |
| Floor relative to water | At a draft of about 0.45 blocks, the deck sits 0.13 to 0.26 blocks above the water surface. Every floor cell is an air cell above the water; no water block is ever replaced |
| Floor under a buoyant boat | The boat climbed onto its own floor, from y -60.39 to -59.69 |
| Holding the boat | Turning off block collision and gravity with a component group, and teleporting the boat to a fixed pose every tick, kept it in place with no drift over 150 ticks |
| Restoring physics | Removing the docked group removed `minecraft:physics` instead of restoring its base component. The boat sat on the water surface with zero velocity. Adding a group that sets `minecraft:physics: {}` on undock made it float again, with y bobbing from -60.38 to -60.52 |
| Bob at rest | The buoyant boat still bobbed by about 0.07 blocks around a draft of about 0.45; the earlier boat decision recorded about 0.17 while moving (0051) |
| Cell coverage | With the cell-center rule and no margin, a hull turned 30 degrees covered 10 cells. A 0.3-block margin covered 13 to 16 cells |

## Manual test results (2026-10-12)

| Item | Result |
|---|---|
| Walking | The jagged edge from the cell-center rule is acceptable for walking |
| Short tap on touch | A short tap on the boat is an attack. A player standing on the deck who taps a seat breaks the boat after 3 hits (0008) |
| Using the boat from the deck | The player stands inside the boat's hit boxes. Long-pressing to use the boat never reached the server: `playerInteractWithEntity` did not fire, so the player could not get into a seat from the deck |
| Seating through script | `rideable.addRider` seats a player, but Bedrock puts the first rider in seat 0 (driver) and the next riders in index order (0019). The boat's own `minecraft:rideable` cannot offer seat selection |
| Reload and restart | State kept only in script memory, including the docked boat, floor cells, and hold pose, was lost on `/reload` and restart. This left a docked boat with no hold or a floor with no boat |
| Leaving the deck | Walking off the edge or jumping over the side drops the player into the water. There is no rim, so a player can also walk off by accident |
| Resource Pack cache | Unrelated to the deck, but found in the same session: serving a changed Resource Pack under a version a device already cached, here `main`'s 0.1.45, made the device show its cached copy (0061, 0062) |

## Findings

- **The floor can match the model without replacing water.** Collision heights in sixteenths reach both the cockpit and the higher bow, and the deck stays above the water surface at the measured draft.
- **A floating boat cannot share a cell with its own floor.** It climbs the floor unless block collision and gravity are off and the script holds its pose. Removing the group that turns them off does not restore the base `minecraft:physics`; a group that sets it again is needed.
- **The boat itself cannot take a seat choice from the deck.** A tap is an attack, a long press from inside the hit boxes never reaches the server, and `rideable.addRider` fills seats in index order (0019).
- **State in script memory does not survive.** `/reload` and restarts lose it, so the docked state, the floor cells, and anything else a docked boat owns have to be stored on entities.
- **The deck has an open edge.** Nothing stops a player from walking off into the water.

## Requirements carried into the design

[0063](adr/0063-walk-on-a-stopped-sports-boat.md) records the exact docking thresholds, hold pose, floor geometry, persistent state, seat transfer, and hit rules for the later parts of the Boat deck series. Docking uses the existing `isAfloat` in [the sports boat drive](../src/domain/vehicle/kinds/sportsboat/drive.ts), and deck seats use `SPORTSBOAT_PROFILE.seats` in [the sports boat profile](../src/domain/vehicle/kinds/sportsboat/profile.ts).

In response to the findings above, 0063 adds a separate invisible one-seat entity at each seat for choosing a seat, ignores hits from a player standing on the floor (painting with a dye still works, 0036), stores the docked state and the laid cells and deck seats on the entities, and clears them as headlight cells are cleared (0020), including on removal by the vehicle limit (0038). Whether to add a rim is left to a playtest.
