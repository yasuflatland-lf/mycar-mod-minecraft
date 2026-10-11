# 0043. Wheel arms in flight and under water

- Status: Accepted
- Date: 2026-10-11
- Extends: 0009 (bones), 0022 (folded wheels), and 0040 (turned rear wheels)

## Context

In flight the folded wheels lay flat right under the body (0022), with the tops of the tires against the chassis, so nothing showed how they were held. The reference is the hovering DeLorean of Back to the Future Part II: each wheel hangs out of its arch on a dark mechanical arm, below and outside the body. Under water the rear wheels already turn to face the rear (0040) and move 6 px out, an offset added with the props after 0040 was written, and they float beside the body with nothing holding them either.

Before 0.1.29 the client dropped the whole animation file over scalar `scale` values, so the submarine wheel moves had never been seen in game. With the file loading again, a positive x in an animation `position` moved the +x rear wheel outward in game: animation positions run along the model's axes. `tools/render_preview.py` had assumed the opposite, which never showed because the folded wheels had no x offset.

## Decision

- In flight each folded wheel also moves `FOLD_OUT` (6 px) outward, on top of the 90° turn and the 4 px drop of 0022: `[±6, -4, 0]` in `wheels_folded`, and as the end and start frames of `wheels_deploy` and `wheels_retract`. The glow disc and its hover locator move out with it
- New bones `arm_fl`, `arm_fr`, `arm_rl` and `arm_rr` (children of `root`) run from inside the wheel arch (12 px out, 9 px up) down and out to the hub on top of the folded wheel, whose lowest cube rests on the tire's top face at y 4. The diagonal is eight overlapping axis-aligned cubes, so it needs no cube rotation, plus a 2.4 px hub plate
- New bones `sub_arm_rl` and `sub_arm_rr` run along x from the body to the hub of the turned rear wheel, `SUB_OUT` (6 px) out as the `dive` and `submerged` animations put it, flat against the tire's front face, opposite the prop on the rear face. An inverted L over the tread, which would also show from the side and behind, was tried and dropped: the straight arm reads better
- Both kinds of arm use a new `arm` swatch, gunmetal (72, 76, 82)
- Every form controller state pins each arm's scale, as for the props (0040): the flight arms grow from 0 to 1 in `wheels_deploy`, stay at 1 in `wheels_folded`, shrink back in `wheels_retract` and stay at 0 elsewhere; the submarine arms follow the props' keyframes in `dive`, `submerged` and `surface` and stay at 0 elsewhere
- Animation positions run along the model's axes. `tools/render_preview.py` adds the offset instead of subtracting it, shows the flight arms only in the flying preview, and leaves the submarine arms out of the ground and flying previews (0045 adds a submarine one)
- The bone contract of 0009 gains the six arm bones

## Consequences

- In flight the vehicle's silhouette is 12 px wider; the collision box stays the same, so the tires can poke out of it
- The flight arms are a voxel staircase rather than a smooth bar
- `FOLD_OUT` and `SUB_OUT` in `tools/gen_model.py` place the arms and the glow, but `suv.animation.json` is written by hand: changing either value, or the 4 px drop that sets the tire top at y 4 in `arm()`, means changing the animation offsets to match. The pack tests read the fold-out from the animation, so a mismatch fails them
