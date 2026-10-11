# 0017. Repaint vehicles with dye

- Status: Superseded by 0031
- Date: 2026-10-11

## Context

Every vehicle is khaki. We want green and red as well. We compared three ways to get a colored vehicle:

- A separate item and recipe per color. Each color needs its own item, icon, recipe, and translation, and breaking a vehicle (0008) has to drop the item of the matching color
- Using a dye on a placed vehicle, the way players dye sheep. One item and one recipe stay as they are
- Both

Both dyes are vanilla items: red dye is crafted from a poppy, red tulip, rose bush, or beetroot, and green dye is smelted from cactus.

## Decision

- Using green or red dye on a vehicle repaints its body. It consumes one dye, except in creative mode. Using a dye of the color the vehicle already has does nothing and keeps the dye
- Using a dye on a vehicle never mounts it: the script cancels `world.beforeEvents.playerInteractWithEntity` and repaints on the next tick, because a before-event cannot change the world
- The paints are `khaki` (variant 0, the starting color), `green` (1), and `red` (2). The entity stores the paint in `minecraft:variant`, set by the events `mycar:paint_<paint>`, and a custom render controller picks the texture by `query.variant`
- `tools/gen_model.py` writes one texture per paint (`suv.png`, `suv_green.png`, `suv_red.png`) that differ only in the `body` swatch. The red body is darker than the tail lights so they still show
- The vehicle item has one color. Breaking a painted vehicle drops the same item as before, so the next one placed is khaki again

## Consequences

- No dye turns a vehicle back to khaki. Mapping one (for example brown dye) to `khaki` only needs a new entry in `PAINT_BY_DYE`, because the event and texture already exist
- The color is lost when a vehicle is picked up. Keeping it would need the item to remember its paint, for example in a dynamic property on the item stack
- A Blockbench model (0009) needs one texture per paint as well, or a tint that the render controller applies
- The in-game tests cannot simulate a player using a dye, so they trigger the paint events directly and check the variant; the dye handling is covered by unit tests only
