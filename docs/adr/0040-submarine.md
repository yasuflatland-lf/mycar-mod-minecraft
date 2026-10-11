# 0040. Submarine form

- Status: Superseded in part by 0042 (propeller shape and color), 0044 (banking under water), and 0045 (README previews)
- Date: 2026-10-11
- Extends: 0009 (bones), 0022 (transform animations), 0028 (camera), 0033 (gear), 0035 (steps), and 0039 (forms)

## Context

The SUV should become a sealed submarine when its roof goes under water, with blue windows and rear wheels that become propeller guards. One form state machine (0039) keeps the vehicle from being both a hover car and a submarine. Script-driven motion can hold depth; engine buoyancy alone cannot. Shallow water should remain drivable as a car, and an unattended submarine should float without taking off.

## Decision

- Add `submarine` to `Form` and the client-synced `mycar:form` enum. Keep property and gravity changes on the same tick (0021): only `car` has gravity. Apply the following transitions in priority order; otherwise keep the current form. Controlled means a driver or test input is present, submerged means `waterDepth >= SPEC.carHeight`, and dry means no water above the feet.

| Current form | Condition | Next form |
|---|---|---|
| car / takeoff / hover / landing | Submerged | submarine |
| car | Controlled double tap of Jump | takeoff |
| takeoff | 20 ticks elapsed | hover |
| hover | On ground | car |
| hover | Double tap of Jump, or uncontrolled | landing |
| landing | On ground | car |
| submarine | Dry, controlled, and Jump held | hover |
| submarine | On ground and not submerged | car |
| submarine | Dry | car |

- Ignore double taps in submarine. Entering submarine requires the roof under water, while breaching to hover requires the body fully out: this gives a car-height band of hysteresis. Shallow water stays `car`. In water deep enough to enter submarine, an unattended vehicle floats at `SPEC.floatDraft` (1.2 blocks, below `SPEC.carHeight` of 1.6). Entering submarine needs a water column of at least `SPEC.carHeight`, so a floating submarine keeps at least `carHeight - floatDraft` (0.4 blocks) of water below it and cannot ground and ping-pong back to car. A controlled submarine resting on the bed stays submarine while submerged.
- Sense water at the vehicle's floored x/z, from `Math.floor(feetY)` upward for at most `Math.ceil(SPEC.carHeight) + 1` cells. When that cell is dry and the feet are above its floor, the vehicle rests on a partial block that cannot be waterlogged (mud or soul sand at 0.875, dirt path or farmland at 0.9375), so start one cell higher. Stop at the first dry cell. Depth is the top of the contiguous water column minus feet height, clamped to `[0, SPEC.carHeight + 1]`; no water in the starting cell gives zero. Count `minecraft:water`, `minecraft:flowing_water`, and waterlogged blocks, including kelp and seagrass. Ignore flowing levels and count each surface cell as full. Undefined or unloaded blocks and lava are not water.
- Choose submarine vertical speed in this order: controlled nonzero climb input uses `command * SPEC.maxClimb` (0.3 blocks/tick); forward throttle with a step ahead rises at `SPEC.maxClimb`, where the step probe looks at least `SPEC.stepMinSpeed` ahead and starts `SPEC.submarineStepProbeDrop` (0.5 blocks) lower, from the feet, so a floating submarine can still climb a shore step; otherwise use `clamp((waterDepth - SPEC.floatDraft) * SPEC.floatGain, -SPEC.surfaceRise, SPEC.surfaceRise)`. `SPEC.floatGain` starts at 0.25 and `SPEC.surfaceRise` at 0.05 blocks/tick. Controlled vehicles discard positive buoyancy, so no input holds depth below the float line but sinks back to it from above. Uncontrolled vehicles rise or sink to the float line and stay there. The proportional correction avoids oscillation near the surface.
- Rise at steps instead of jumping (0035), because submarine has no gravity. This lets it climb a shore of one-block steps, sink onto the shore, and become a car.
- Use hover horizontal handling without reverse or handbrake. Keep ram damage (0006); bank only in hover. Keep gear down in submarine, including immediately on entry from hover (0033). Keep all tuning in `SPEC`: `maxWaterSpeed` starts at 0.5 blocks/tick; `waterDrag` and `waterVerticalDrag` start at 0.8. Measure drag and validate speed and float tuning in series 7/8.
- Every player rider uses third person through the existing any-form-but-car rule (0028, 0039). Refresh `water_breathing` every `SPEC.waterBreathingInterval` (20 ticks, one second) for `SPEC.waterBreathingTicks` (60 ticks, three seconds), with particles hidden. Log each failed refresh independently and continue with the others. The effect lapses by itself after leaving or `/reload`.
- Extend the bone contract (0009) with `windows_sealed`, a child of `body`, and `prop_rl` / `prop_rr` at the rear wheel axles. `windows_sealed` covers the side and front windows with the same blue as `rear_glass` and is visible only in submarine; the existing rear glass covers the rear window.
- Turn the rear wheels 90 degrees around y over one second so their tires face backward as ring guards for ducted three-blade propellers, like a Schwimmwagen. Grow the propellers from scale zero to one; spin them with `query.modified_distance_moved` while submerged. Leave the front wheels unchanged and hide props in other forms.
- Extend the form animation controller with `ground` → `dive` → `submarine` → `surface` → `ground`. Dive and surface take one second each. Gear transitions remain separate: hover to submarine runs `retract` → `ground` → `dive`; submarine to hover runs `surface` → `ground` → `deploy`. Never drive one bone with two transforms at once (0022). README previews omit the new bones. Visual implementation belongs to series 5/8 and 6/8.

## Consequences

- A `/reload` just as a rider leaves can leave them in third person; F5 restores their view, as in 0028. Water breathing expires within three seconds without tracking who left.
- The vehicle cannot back up under water. Leaving the water requires holding Jump to breach into hover or driving up a shore of steps.
- Block-level sensing approximates flowing water surfaces. Drag and float tuning remain provisional until measured in game in series 7/8.
- The entity definition requires a server restart. The later Resource Pack changes require a manifest version bump so clients discard cached visuals (0015).
