# 0061. Lift the sports boat bow the right way and roll it further

- Status: Accepted
- Date: 2026-10-12

## Context

0059 left the signs of the bow rise and the roll to be checked in game. On the dev BDS (1.26.52) the bow dipped while the boat gained speed, so a positive x rotation of the `root` bone lowers the bow; the roll leaned the right way. 0059 said to flip a wrong sign in the animation.

Checking the flip in game first went wrong for a reason outside the model. The dev BDS served the flipped Resource Pack as 0.1.45, but `main` had already released another 0.1.45 (0060), and a device that had that copy cached kept using it, so the bow still dipped whatever the probe changed. Probes served as 0.1.46 to 0.1.49 showed the changes. With a version no device had seen, the driver tried maximums live: a 15-degree bow rise was too much, and the 7 degrees of 0059 looked right. The 10-degree roll looked too slight, and 20 degrees looked right.

## Decision

- The attitude animation turns `root` by minus `trim` on x, so the bow lifts while the boat gains speed. The roll on z keeps its sign
- `maxRoll` rises from 10 to 20 degrees, so `yasu_ride:roll` ranges from -20 to 20, and the roll moves by at most 2 degrees per tick, so a full roll still builds up in half a second
- Everything else in 0059 stays, including the 7-degree `maxTrim` and its rates

## Consequences

- The Behavior Pack entity and the Resource Pack change together (0015). The Resource Pack goes to 0.1.50, skipping 0.1.46 to 0.1.49, which the dev BDS served with probe content and devices may still hold
- Before checking a Resource Pack change in game, give it a version that neither `main` nor another branch's dev BDS has served, or a device may show its cached copy instead
- Riders stay level while the hull rolls by up to 20 degrees, so a seated rider sees the gunwale tilt twice as far as before
