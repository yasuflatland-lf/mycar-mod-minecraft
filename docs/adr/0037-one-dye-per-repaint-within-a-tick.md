# 0037. Use one dye per repaint within a tick

- Status: Accepted
- Date: 2026-10-11

## Context

`PaintVehicle` (0031) skips a dye of the color the vehicle already has, and reads that color from `minecraft:variant`. An in-game measurement (2026-10-11) showed that right after `triggerEvent(mycar:paint_<paint>)` the variant still holds the old value; it holds the new one by the next tick.

Since 0036 a hit with a dye repaints. The vehicle takes no damage (0008), so it has no invulnerability window after a hit, and every tap or left-click fires `entityHitEntity`. If two hits with the same dye reach the script in one tick, from one player or from two, both read the old color, both repaint, and both use a dye for a single change.

## Decision

- `PaintVehicle` remembers the paints it applied in the current tick, keyed by vehicle, and treats a remembered paint as the vehicle's color. A second hit with the same dye in that tick does nothing and keeps the dye
- The tick comes in the command, as for hits (0008). The memory is cleared when a command for a later tick arrives
- A different dye in the same tick still repaints and uses its dye; the last one applied wins

## Consequences

- The rule is plain logic in the application layer, so it is covered by property tests with a world that applies paints a tick late
- It relies on the engine applying the variant within one tick, as measured. If that ever takes longer, a hit in a later tick could still use a second dye; `paint_events` in the in-game tests reads the variant one tick after each event and would fail first
