# 0047. Rename to the Yasuflatland Add-on

- Status: Accepted
- Date: 2026-10-11

## Context

The add-on will grow beyond the SUV into boats and house-building parts. The name `mycar` no longer describes the intended content. The feature layout (0046) separates kinds of content while keeping the three layers (0012). All content will still ship together.

Resource Pack files at the same path in two packs override each other, and item texture shortnames share one atlas across packs. Generic paths and shortnames can collide with another add-on.

## Decision

Ship one Behavior Pack and one Resource Pack as the **Yasuflatland Add-on**, in the repository `yasuflatland-addon-minecraft`. Replace only the former name and namespace; preserve behavior, tuning, model bone names (0009), and every pack and module UUID. Existing worlds that list these UUIDs load the new pack versions. Do not migrate old entity or item IDs.

| Old | New |
|---|---|
| `mycar:` IDs, properties, component groups, events, script events, dynamic properties, and lang keys | `yasuflatland:`; IDs use snake case |
| `mycar_test:` test entity IDs | `yasuflatland_test:` |
| `geometry.mycar.<name>` | `geometry.yasuflatland.<name>` |
| `animation.mycar.<entity>.<name>` | `animation.yasuflatland.<entity>.<name>` |
| `controller.<kind>.mycar.<entity>[.<name>]` | `controller.<kind>.yasuflatland.<entity>[.<name>]` |
| `mycar.<name>` sound events | `yasuflatland.<name>` |
| `mycar_suv_item`, `mycar_headlight_switch` item texture shortnames | `yasuflatland_suv_item`, `yasuflatland_headlight_switch`; future shortnames use `yasuflatland_<name>` |
| `resource_pack_name: mycar` | `resource_pack_name: yasuflatland` |
| `mycar_vehicle` type family | `yasuflatland_vehicle` |
| `mycar_bp`, `mycar_rp`, `mycar_test_bp` | `yasuflatland_bp`, `yasuflatland_rp`, `yasuflatland_test_bp` |
| `NAMESPACE = "mycar"` | `NAMESPACE = "yasuflatland"`; build infrastructure IDs with `id()` |
| `[mycar]` script log prefix | `[yasuflatland]` |
| `mycar-bds` container, `mycar-dev` Compose project and world | `yasuflatland-bds`, `yasuflatland-dev` |
| `dist/mycar-<version>.mcaddon` | `dist/yasuflatland-addon-<version>.mcaddon` |
| `mycar-mod-minecraft` repository and package name | `yasuflatland-addon-minecraft` |
| `MyCar`, `MyCar Resources`, `MyCar Tests` | `Yasuflatland Add-on`, `Yasuflatland Add-on Resources`, `Yasuflatland Add-on Tests` |

Keep content files flat under `<type>/yasuflatland/<file>` in both packs: entities, items, recipes, client entities, animations, animation controllers, render controllers, particles, models/entity, textures/entity, textures/items, and sounds. Test entities use `entities/yasuflatland_test/`. Engine-fixed files stay at `manifest.json`, `texts/*.lang`, `texts/languages.json`, `textures/item_texture.json`, and `sounds/sound_definitions.json`. Update generators and every asset reference to these paths.

Bump the Resource Pack patch version and the Behavior Pack dependency together (0015). The Resource Pack is at 0.1.33 before the rename, so the rename raises it to 0.1.34. Leave the Behavior Pack version unchanged; releases manage it separately.

Historical ADRs, release summaries, and design documents retain the former name. A naming test checks all tracked and unignored files outside those directories and reports each remaining lowercase occurrence with its file and line.

## Consequences

- `mycar:*` vehicles and items disappear from existing worlds. Players get new ones with `/give @s yasuflatland:suv_item` or the recipe.
- Switch the headlights off before upgrading. Light blocks left by a vehicle with its lights on stay in the world because its record of lit cells lives on the vanished entity. No cleanup or migration is added.
- The fleet record starts empty, and every player receives the starter vehicle again on their next join because the dynamic property keys change.
- The dev world starts fresh as `yasuflatland-dev`. Leave `server/data/worlds/mycar-dev` alone; it can be deleted by hand.
- UUID continuity preserves world pack registration, but does not preserve content with the old IDs. Resource Pack changes require a server restart and a fresh client download (0015).
- Immediately after merge, the owner renames the GitHub repository to `yasuflatland-addon-minecraft` and checks the Codecov badge so the updated README links resolve.
