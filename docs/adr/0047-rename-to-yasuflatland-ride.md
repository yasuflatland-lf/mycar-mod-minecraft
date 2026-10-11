# 0047. Rename to Yasuflatland Ride

- Status: Accepted
- Date: 2026-10-12

## Context

The add-on holds only rides: the SUV now and boats later. The name `mycar` no longer describes the intended content. The feature layout (0046) separates kinds of content while keeping the three layers (0012). House-building parts will ship as a separate add-on with its own namespace, for example `yasuflatland_build`, not as a feature of this add-on.

Microsoft's [Guidelines for Building Cooperative Add-Ons](https://learn.microsoft.com/en-us/minecraft/creator/documents/practices/guidelinesforbuildingcooperativeaddons) recommend a namespace of the form `<creator>_<pack>` that differs for every add-on. Minecraft Creator Tools' cooperative add-on validator rejects a namespace without an underscore-separated creator and pack part. The guidelines also warn that changing a released namespace removes entity types and their instances from worlds.

Resource Pack files at the same path in two packs override each other, and item texture shortnames share one atlas across packs. Generic paths and shortnames can collide with another add-on.

## Decision

Ship one Behavior Pack and one Resource Pack as **Yasuflatland Ride**, in the repository `yasuflatland-ride-minecraft`. Replace only the former name and namespace; preserve behavior, tuning, model bone names (0009), and every pack and module UUID. Existing worlds that list these UUIDs load the new pack versions. Do not migrate old entity or item IDs.

Use `yasuflatland_ride` as the namespace, following `<author>_<product>`: the author prefix identifies the creator and `ride` identifies this add-on. The namespace never changes after the first release under this name. This is a one-time break: the released `mycar` namespace (MyCar 0.5.0 and earlier) is dropped without migration (see Consequences), and the first release under the new name freezes `yasuflatland_ride`.

| Old | New |
|---|---|
| `mycar:` IDs, properties, component groups, events, script events, dynamic properties, and lang keys | `yasuflatland_ride:`; IDs use snake case |
| `mycar_test:` test entity IDs | `yasuflatland_ride_test:` |
| `geometry.mycar.<name>` | `geometry.yasuflatland_ride.<name>` |
| `animation.mycar.<entity>.<name>` | `animation.yasuflatland_ride.<entity>.<name>` |
| `controller.<kind>.mycar.<entity>[.<name>]` | `controller.<kind>.yasuflatland_ride.<entity>[.<name>]` |
| `mycar.<name>` sound events | `yasuflatland_ride.<name>` |
| `mycar_suv_item`, `mycar_headlight_switch` item texture shortnames | `yasuflatland_ride_suv_item`, `yasuflatland_ride_headlight_switch`; future shortnames use `yasuflatland_ride_<name>` |
| `resource_pack_name: mycar` | `resource_pack_name: yasuflatland_ride` |
| `mycar_vehicle` type family | `yasuflatland_ride_vehicle` |
| `mycar_bp`, `mycar_rp`, `mycar_test_bp` | `yasuflatland_ride_bp`, `yasuflatland_ride_rp`, `yasuflatland_ride_test_bp` |
| `NAMESPACE = "mycar"` | `NAMESPACE = "yasuflatland_ride"`; build infrastructure IDs with `id()` |
| `[mycar]` script log prefix | `[yasuflatland_ride]` |
| `[MYCAR-TEST]` test pack log tag | `[YASUFLATLAND-RIDE-TEST]` |
| `mycar_arena` test ticking area | `yasuflatland_ride_arena` |
| `mycar-bds` container, `mycar-dev` Compose project and world | `yasuflatland-ride-bds`, `yasuflatland-ride-dev` |
| `dist/mycar-<version>.mcaddon` | `dist/yasuflatland-ride-<version>.mcaddon` |
| `mycar-mod-minecraft` repository and package name | `yasuflatland-ride-minecraft` |
| `MyCar`, `MyCar Resources`, `MyCar Tests` | `Yasuflatland Ride`, `Yasuflatland Ride Resources`, `Yasuflatland Ride Tests` |

Keep content files flat under `<type>/yasuflatland_ride/<file>` in both packs: entities, items, recipes, client entities, animations, animation controllers, render controllers, particles, models/entity, textures/entity, textures/items, and sounds. Test entities use `entities/yasuflatland_ride_test/`. Engine-fixed files stay at `manifest.json`, `texts/*.lang`, `texts/languages.json`, `textures/item_texture.json`, and `sounds/sound_definitions.json`. Update generators and every asset reference to these paths.

Bump the Resource Pack patch version and the Behavior Pack dependency together (0015). The Resource Pack is at 0.1.33 before the rename, so the rename raises it to 0.1.34. Leave the Behavior Pack version unchanged; releases manage it separately.

Historical ADRs, release summaries, and design documents retain the former name. A naming test checks all tracked and unignored files outside those directories and reports each remaining lowercase occurrence with its file and line.

## Consequences

- `mycar:*` vehicles and items disappear from existing worlds. Players get new ones with `/give @s yasuflatland_ride:suv_item` or the recipe.
- Switch the headlights off before upgrading. Light blocks left by a vehicle with its lights on stay in the world because its record of lit cells lives on the vanished entity. No cleanup or migration is added.
- The fleet record starts empty, and every player receives the starter vehicle again on their next join because the dynamic property keys change.
- The dev world starts fresh as `yasuflatland-ride-dev`. Leave `server/data/worlds/mycar-dev` alone; it can be deleted by hand. The test pack no longer removes the `mycartest` ticking area that older test runs left behind, because the fresh dev world never had it.
- UUID continuity preserves world pack registration, but does not preserve content with the old IDs. Resource Pack changes require a server restart and a fresh client download (0015).
- On a dedicated server, delete the old MyCar pack folders from `behavior_packs` and `resource_packs` before copying in `yasuflatland_ride_bp` and `yasuflatland_ride_rp`. The old and new folders share UUIDs; keeping both registers two packs under one UUID.
- After the stack merges, the owner renames the GitHub repository to `yasuflatland-ride-minecraft` and checks the Codecov badge so the updated README links resolve.
