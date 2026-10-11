# 0031. Repaint vehicles with all sixteen dyes

- Status: Superseded in part by 0036 (painting by interacting)
- Date: 2026-10-11
- Supersedes: 0017

## Context

0017 let green and red dye repaint a vehicle, and no dye could turn it back to khaki. Players want more colors. Bedrock has 16 dye items (`minecraft:<color>_dye`). The texture-per-paint approach of 0017 adds a color with data alone (a component group, an event that every other paint event also removes, a texture, and a render controller slot) and needs no new API. Choosing any RGB color would need a tinted material and a new property, which we have not tried on the stable API (0001).

## Decision

- Every vanilla dye repaints a vehicle. Brown dye restores the starting khaki; each of the other 15 dyes paints the color of its name. Using a dye consumes one, except in creative mode. A dye of the color the vehicle already has does nothing and keeps the dye
- Using a dye on a vehicle never mounts it: the script cancels `world.beforeEvents.playerInteractWithEntity` and repaints on the next tick, because a before-event cannot change the world
- The paints, in `minecraft:variant` order, are `khaki` (0), `green` (1), `red` (2), `white`, `light_gray`, `gray`, `black`, `orange`, `yellow`, `lime`, `cyan`, `light_blue`, `blue`, `purple`, `magenta`, `pink` (15). `PAINTS` in the domain holds this order, and the dye map and variant numbers in the scripts are derived from it. The pack JSON is kept in the same order by hand, and `tests/packs/paint.test.ts` checks it against `PAINTS`. The first three keep the variants of 0017, so painted vehicles in existing worlds keep their color. New paints go at the end
- The entity stores the paint in `minecraft:variant`, set by the events `mycar:paint_<paint>`, and the render controller picks the texture by `query.variant`
- `tools/gen_model.py` writes one 64x16 texture per paint (`suv.png` for khaki, `suv_<paint>.png` for the rest) that differ only in the `body` swatch. Red stays darker than the tail lights, orange darker than the amber lamps, and black lighter than the grille, so those details still show
- The vehicle item has one color. Breaking a painted vehicle drops the same item, so the next one placed is khaki again

## Consequences

- The Resource Pack carries 16 entity textures of about 200 bytes each, 3.3 KB in all
- A gray body sits close to the wheel spokes, a light gray body close to the rims, a yellow body close to the amber lamps, and a black body close to the trim; we accept this
- The legacy dye items (ink sac, bone meal, cocoa beans, lapis lazuli) do not repaint. Supporting one needs an entry beside the derived ones in `PAINT_BY_DYE`, and `consumeDye` would have to take the item the player held instead of the dye `dyeOf` gives for the paint, or the repaint would be free
- A Blockbench model (0009) needs 16 textures as well, or a tint that the render controller applies
- The color is still lost when a vehicle is picked up, as in 0017
- The in-game tests cannot simulate a player using a dye, so they trigger every paint event and check its variant; the dye mapping and the use case are covered by unit tests only
- Revisit with a tinted material if players want colors that no dye gives
