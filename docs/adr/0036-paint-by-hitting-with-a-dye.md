# 0036. Paint by hitting with a dye, and get in by interacting

- Status: Accepted
- Date: 2026-10-11
- Supersedes in part: 0008 (hits made while holding a dye), 0031 (painting by interacting)

## Context

0031 repaints a vehicle when a player uses a dye on it, through `world.beforeEvents.playerInteractWithEntity`, and cancels that interaction so the player does not get in. On a phone joined to the dev BDS, a player standing next to a vehicle and tapping it with red dye did not repaint it; only a rider could (manual test, 2026-10-11). Logging the related events showed why:

- A short tap on an entity is an attack on touch. It fired `world.afterEvents.entityHitEntity` and no interaction event, so the dye did nothing and the tap counted as one hit toward breaking the vehicle (0008)
- A long press is the interaction. It fired `playerInteractWithEntity` with the dye, and the vehicle was repainted
- A rider's tap on their own vehicle is an interaction (0020), which is why painting worked while riding
- With an empty hand, the on-screen ride button fired `playerInteractWithEntity` and the player got in. With a dye in hand, the same interaction repainted instead, so a player holding a dye could not get in

## Decision

- When a player hits a vehicle while the selected hotbar slot holds one of the 16 dyes of 0031 (`minecraft:<color>_dye`), the hit repaints the vehicle by the rules of 0031 and does not count toward breaking it
- Interacting with a vehicle (the ride button or a long press on touch, right-click on PC) no longer repaints it, whatever the player holds. It gets the player in as it does with an empty hand. The headlight switch of a rider aiming at their own vehicle (0020) is still handled there
- `entityHitEntity` is an after-event, which may change the world, so the repaint runs in the handler without `system.run`

## Consequences

- A tap repaints on mobile, the gesture players try first, and the ride button works with any item in hand
- On PC, a left-click with a dye repaints and a right-click gets in
- A player holding a dye cannot break a vehicle; they have to switch to another item first
- A hit with a dye of the color the vehicle already has does nothing: it neither repaints nor counts as a hit
- On touch, a rider can no longer repaint the vehicle they ride, because their tap on it is an interaction (0020). They get out to repaint it. On PC, a rider's left-click still repaints
- The in-game tests still cannot hit or interact as a player (0010, 0031), so the event wiring is covered by the manual test only
