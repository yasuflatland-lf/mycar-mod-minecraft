# 0051. Sports boat

- Status: Superseded in part by 0066 (counting boats under the world limit of 10); extended by 0058 and 0063
- Date: 2026-10-12

## Context

The [sports boat spike](../spike-sportsboat.md) tried a separate driven entity modelled on a 25-foot wake boat (0046, 0050). Approach A held the draft in script; approach B used `minecraft:buoyant`. A settled without bobbing and followed its target speed. B kept bobbing by about 0.17 blocks, capped near 1.02 blocks/tick even at targets of 1.12 and 1.4, and lost two thirds of its speed in a full turn. The driver chose B after trying both; its bob was not noticed.

## Decision

- Float the boat `yasu_ride:sportsboat` with approach B, as the driver chose, although B measured less steady than the script float (A): `minecraft:buoyant`, base buoyancy 1.0, gravity on, no waves, and `minecraft:water` and `minecraft:flowing_water` as liquids
- Use a 2.2-wide, 1.2-high collision box and three `minecraft:custom_hit_test` boxes, each 2.2 wide and 1.4 high, centered 0.7 blocks up at z -1.6, 0, and 1.6
- Give it four seats at the SUV's x/z positions and 0.52 blocks up, with seat 0 (front right) the driver, no doors, 16 paints with black as the default, and the headlights property. Store these in its own profile (0050)
- Treat the boat as afloat when there is water at its feet or 0.3 blocks below them. Afloat, the script drives x and z in water with gravity left on and no vertical impulse. Beached, it coasts to a stop. It has no forms, camera switch, or water breathing
- Give the boat its own motion parameters: top speed 1.12 blocks/tick, acceleration 0.0225 blocks/tick per tick, reverse speed 0.2 blocks/tick, and turn rate 6 degrees/tick. Never reuse SUV constants
- Set ram reach to 3.0 blocks ahead and 1.06 to each side. Mobs take ram damage; the boat and riders do not (0006)
- Put headlights 4 to 60 blocks ahead, every 4 blocks, in two beams 3 blocks either side of the center line
- Add `yasu_ride:sportsboat_item` with a boat icon. Place it on the water surface from the clicked block or view ray, climbing to the top water cell when the clicked block is the bed; allow placement on land too
- Breaking with three hits drops the boat item. Count boats and SUVs together under the world fleet limit of 10 (0038)
- Start from the spike's model: a black hull with a `#616161` stripe, a wraparound windshield raked back 55 degrees with a walk-through, a raked wake tower with a short soft top over the helm, tan seats with charcoal stripes and quilted centers, a teak floor, an open bow, a gray swim platform with a ladder, twin jet nozzles, and flush teardrop headlights on the bow flanks
- Use bones `root`, `body`, `headlights`, and `windshield`, with the front at -z and no logo or model name (0009)
- Mind the sign of cube x rotations: in game, a negative x rotation tips the cube's +y toward +z before the model is turned 180 degrees, while `tools/render_preview.py` draws x rotations the other way round. The tower struts, the helm display, and the jet bucket hoods depend on this, so check them in game

## Consequences

- A moving boat with its lights on places up to 30 light blocks per tick, against the SUV's 5
- B's engine cap near 1.02 blocks/tick remains until drag is measured and tuned in 8/8. The target speed and turn rate are requirements, not achieved measurements; revisit B if that work cannot reach 1.12 blocks/tick
- The boat cannot leave the water by itself: a flush beach and a one-block bank both stop it, so no separate beaching rule is needed
- The square collision box lets the bow overlap a shore. The lowered seats and the three hit boxes still need in-game confirmation

[0053](0053-estimate-buoyant-boat-water-drag.md) measures the water drag and estimates it every tick.

[0058](0058-refine-the-sports-boat-interior.md) refines the interior, helm, wheel, speakers, and top of the spike's model.
