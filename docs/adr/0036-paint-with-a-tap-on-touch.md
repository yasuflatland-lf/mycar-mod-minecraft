# 0036. Paint with a tap on touch

- Status: Accepted
- Date: 2026-10-11

## Context

0031 repaints a vehicle when a player uses a dye on it, through `world.beforeEvents.playerInteractWithEntity`. On a phone joined to the dev BDS, a player standing next to a vehicle and tapping it with red dye did not repaint it; only a rider could (manual test, 2026-10-11). Logging the related events showed why:

- A short tap on an entity is an attack on touch. It fired `world.afterEvents.entityHitEntity` and no interaction event, so the dye did nothing and the tap counted as one hit toward breaking the vehicle (0008)
- A long press is the interaction. It fired `playerInteractWithEntity` with the dye, and the vehicle was repainted
- No interaction button appeared on screen while holding a dye
- A rider's tap on their own vehicle is an interaction (0024), which is why painting worked while riding

## Decision

- When a player hits a vehicle while the selected hotbar slot holds a vanilla dye, the hit repaints the vehicle by the rules of 0031 and does not count toward breaking it
- The interaction path of 0031 (long press on touch, right-click on PC) stays as it is
- The hit is an after-event, so the repaint runs in the same tick

## Consequences

- A tap repaints on mobile, the gesture players try first
- On PC, a left-click with a dye repaints too. A player holding a dye cannot break a vehicle; they have to switch to another item first
- A hit with a dye of the color the vehicle already has does nothing: it neither repaints nor counts as a hit
- The in-game tests still cannot hit or interact as a player (0031), so the event wiring is covered by the manual test only
