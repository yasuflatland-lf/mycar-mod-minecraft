# 0042. Bronze four-blade propellers

- Status: Accepted
- Date: 2026-10-11

## Context

The submarine's rear wheels turn into ring guards around ducted three-blade propellers (0040). Each blade was one straight brass bar, so the prop read as a fan rather than a ship's screw. The reference is a large cast ship propeller: four wide blades that curve back like scimitars around a round hub with a bore, all in polished bronze. The prop still has to fit inside the tire's inner radius (4.6 px), so the tread ring keeps framing it.

## Decision

- Each prop has four blades, 90 degrees apart, replacing the three blades of 0040
- A blade is three segments (`PROP_BLADE` in `tools/gen_model.py`): root 0.9–2.0 px out and 1.1 px wide, middle 1.9–3.3 px and 2.1 px wide, tip 3.2–4.3 px and 1.6 px wide. They turn 0, 14 and 30 degrees further around the axle, so the blade widens and then sweeps back toward the tip. The farthest corner is 4.37 px from the axle
- The hub is a twelve-sided cylinder of radius 1.4 px that stands 0.3 px proud of the blades, with an eight-sided dark bore (the `tire` swatch) on its outer face
- Blades use the `prop` swatch, now polished bronze (214, 170, 82); the hub uses a new, lighter `prop_hub` swatch (236, 196, 110)
- Every cube still turns only around the axle and stays thinnest along x, so the spin and the scale animations of 0040 apply unchanged

## Consequences

- The prop has 13 more cubes than before (17 instead of 4)
- The blades have no pitch: a voxel cube cannot twist, so they lie flat in the wheel's plane and read as swept only from the side
- `tests/packs/model.test.ts` checks the four blades, the sweep growing toward the tip, and the inner radius
