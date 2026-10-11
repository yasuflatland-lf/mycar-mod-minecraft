# 0008. Placing and picking up vehicles

- Status: Superseded in part by 0036 (hits made while holding a dye)
- Date: 2026-10-10

## Context

In survival, players should be able to obtain a vehicle and put it away. The vehicle is invulnerable (0006), so ordinary attacks cannot break it. For picking it up we compared "sneak + use with an empty hand", "sneak + punch", and "breaks after a few punches", and chose punching to pick it up, the same as minecarts and boats.

The requirements did not say what happens when the vehicle is broken with occupants inside, or when an occupant punches their own vehicle.

## Decision

- The vehicle item is crafted. Using it on the ground consumes one item and places one vehicle
- When a player punches a vehicle three times, remove the vehicle and drop one vehicle item. The count is a tuning value
- Detect punches with `world.afterEvents.entityHitEntity`. Keep the vehicle's `damage_sensor` cancelling all damage
- While the vehicle has occupants, punches are not counted (it does not break). So an occupant punching their own vehicle does not break it
- Reset the count to 0 if the vehicle is not punched for a while (100 ticks)

## Consequences

- A vehicle can still be broken by accident during combat. A vehicle with occupants does not break, so it never breaks while being driven
- The crafting ingredients are decided in the implementation plan. Sub-project 3 replaces this recipe with a Workstation recipe
- Whether `entityHitEntity` fires for attacks on a vehicle whose damage is cancelled is to be confirmed at the start of implementation
