# 0022. Fold the wheels and light their undersides in flight

- Status: Superseded in part by 0033 (when the wheels unfold) and 0043 (where the folded wheels hang)
- Date: 2026-10-11

## Context

In flight (0021) the SUV should look like the hover conversion in Back to the Future Part II: the wheels turn flat under the body and glow blue underneath. The body itself must not change. An entity cannot emit block light (0020). The headlights work around this by placing light blocks; lighting the ground under a flying car the same way is left out of this decision. The wheel spin is an animation on the wheel bones driven by `query.modified_distance_moved` (0009).

## Decision

- In flight each wheel bone rotates 90° around z at its axle pivot, hub side down, and moves 4 px down, so the tire lies flat under the body. The left and right wheels turn opposite ways. Folding and unfolding take 1 second each
- The animation controller `controller.animation.mycar.suv.flight` reads `mycar:flight` (0021) and runs `ground` → `deploy` → `hover` → `retract` → `ground`. The wheel spin plays only in `ground`, so spin and fold never drive the same bone at once; the spin angle snaps to 0 when folding starts
- New bones `glow_fl`, `glow_fr`, `glow_rl`, `glow_rr` (children of `root`, a 10×0.5×10 px disc under each folded wheel) with the locators `hover_fl`, `hover_fr`, `hover_rl`, `hover_rr`. This extends the bone contract of 0009
- The whole model uses the material `entity_emissive_alpha`, except the `headlights` bone, which keeps its own lamp materials (0020). Only the glow swatch has partial alpha (40 of 255), so only the discs glow
- The render controller `controller.render.mycar.suv`, which already picks the paint texture (0017), also hides `glow_*` while `mycar:flight` is `ground`
- The particle `mycar:hover_glow` drifts down from each `hover_*` locator in the `hover` state
- `tools/render_preview.py` skips `glow_*`, so the README preview keeps the ground form

## Consequences

- The ground under a flying car is not actually lit; the discs and particles only look bright
- A replacement model made in Blockbench must keep the wheel pivots at the axle centers and include the `glow_*` bones and `hover_*` locators
- If the snap of the spin angle at the start of folding looks bad, add a parent bone per wheel that only folds
