# 0018. Treat a sideways stick as a slow forward turn

- Status: Accepted
- Date: 2026-10-11

## Context

0005 turns the forward/back value of the movement vector into throttle once it passes 0.1, so a mobile player can steer hard at full throttle.

On a phone, a player who stops and pushes the stick straight right to turn right gets the opposite. In game the stick read `moveX = -0.99` with `moveY` between -0.18 and -0.22: the thumb sits slightly below horizontal. That backward value passed the 0.1 deadzone, so the vehicle reversed at up to 0.2 blocks/tick, and steering is reversed when backing up (0002). The player saw the vehicle back away and turn the wrong way.

## Decision

- Keep 0005's mapping: when the forward/back value exceeds 0.1, the throttle is `sign × min(1, |value| / 0.5)`, and the left/right value is the steering
- Exception: when the left/right value exceeds 0.1 and the stick is within 20 degrees of horizontal (`|moveY| ≤ tan(20°) × |moveX|`), ignore the forward/back value and creep instead
- Creeping speeds the vehicle up (or brakes it out of reverse) to 0.12 blocks/tick and holds it there. Above 0.12 it coasts down with the usual drag and stops at 0.12. 0.12 is below the ram threshold of 0.15 (0006), so a creeping vehicle never damages mobs, and it is above the speed at which steering reaches full effect (0.08), so the vehicle turns at its full rate
- Creeping never jumps a two-block step (0004), because that needs forward throttle
- Do not branch on device type, as in 0005

## Consequences

- From a stop, pushing the stick sideways turns the vehicle toward that side in a circle about 2.3 blocks across (0.12 blocks/tick at 6 degrees/tick), instead of reversing
- 0005's spike measurement (left/right 0.90, forward/back 0.48) is 28 degrees from horizontal, so hard turns at full throttle still get full throttle
- To reverse, the stick must point more than 20 degrees below horizontal
- On a keyboard, pressing only A or D now creeps forward. While driving faster than 0.12 it coasts as before, but it no longer coasts to a stop. Revisit if keyboard players find this surprising
