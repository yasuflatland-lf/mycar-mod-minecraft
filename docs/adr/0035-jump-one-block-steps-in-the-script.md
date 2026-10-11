# 0035. Jump one-block steps in the script, and skip blocks without a collision box

- Status: Accepted
- Date: 2026-10-11
- Supersedes in part: 0004 (leaving one-block steps to the engine)

## Context

In 0004 one-block steps are left to the engine's `minecraft:variable_max_auto_step` (1.0625), and the script jumps only two-block steps. With a player in the driver's seat, the SUV stopped at one-block stone steps on the dev BDS (manual test, 2026-10-11). The in-game tests drive with test input and no rider, and still climbed them.

A trace of the vehicle each tick showed it hit a one-block step at 0.6 blocks/tick and stop dead, with no rise at all. Tried with a player riding, one server restart each:

| Change to the entity | One-block step |
|---|---|
| Seats back at y 0.1 (before 0029) | stops |
| Without `minecraft:input_ground_controlled` | climbs (y +1 in one tick) |

So a controlling rider, which `input_ground_controlled` makes the driver (0025), turns off the engine's auto step. The component cannot go: without it, Jump dismounts a touch rider (0025). The script's two-block jump still worked with a rider.

The script's solid check counted every block that is not air, a liquid, or a light block. That was harmless while it only fed the two-block look-ahead, but a one-block look-ahead would jump over flowers, grass, carpets and torches. The stable API has no `isSolid`. `Dimension.getBlockFromRay` with `includePassableBlocks: false`, cast down from just above a cell, hit stone, slabs, stairs and fences, and passed through poppies, short grass, carpets, snow layers and torches. A ray that starts inside a block found nothing, not even the block below it.

## Decision

- The look-ahead of 0004 reports the height of the step to jump: 1 or 2 blocks, or none. A one-block step needs room for `SPEC.carHeight` above it, as a two-block step does. When rays at the same distance find both heights, the higher one wins
- A one-block step jumps at `SPEC.oneStepVelocity` (0.45, peaking about 1.4 blocks up; a player's jump of 0.42 peaks at 1.25). A two-block step keeps `SPEC.stepVelocity` (0.75). Everything else from 0004 stays: the minimum speed, the 10 ticks of air control, and the three rays
- `solidAt` counts a cell as solid only if a ray cast down from just above it, ignoring passable blocks and liquids, hits that cell. A cell under another non-air block counts as solid without a ray, because the ray would start inside that block
- `minecraft:variable_max_auto_step` stays, so a vehicle without a controlling rider can still step up anything the look-ahead misses

## Consequences

- With a rider, one-block steps, slabs and stairs are climbed with a small hop instead of the engine's smooth step. Without a rider the script now hops them too, because it jumps before the engine would step
- Flowers, grass, carpets and torches no longer count as obstacles, for steps and for the landing gear probe (0033). A two-block step with a flower on top is now climbed
- A passable block under a solid one (a flower under an overhang) still counts as solid
- The in-game test `passable_no_hop` drives over carpets and torches without a jump. Climbing with a rider cannot be tested from a script, because only players can ride the SUV; manual test row 5 covers it
