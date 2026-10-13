# 0056. Render README previews of the sports boat

- Status: Accepted
- Date: 2026-10-12

## Context

The README shows four previews of the SUV, rendered from the model files (0016, 0027, 0045). The sports boat (0051) has no picture, so a reader cannot see that the add-on holds a second vehicle or what it looks like. Its model differs from the SUV's in ways the SUV renderer does not handle: the windshield swatch is see-through (alpha 80) and drawn with `entity_alphablend`, the hull floats with its feet about 0.45 blocks under the water surface (docs/spike-sportsboat.md), and cube x rotations turn the other way in game from the renderer's `rotate()` (0051).

## Decision

- `tools/render_preview.py` also writes four boat images into `docs/images`, all in the default black texture: `sportsboat-afloat.png` and `sportsboat-headlights.png` (headlights on at dusk) from the SUV's front-left view, `sportsboat-rear.png` from the rear-left corner, and `sportsboat-top.png` from straight above. The README shows them as a second row of the SUV's four-column table, so a reader sees the stern deck, the swim platform, and the deck plan as well as the bow
- The rear view mirrors the SUV's view direction front to back, `(-1, 0.65, 1)`. The top view looks along `(0, 1, 0)` with the world's -x pointing up in the image, so the bow points right and the long hull fills the landscape frame
- Poses seen from the same direction share one camera and frame. Each view is centered on its own, and all four share one scale, separate from the SUV's: the largest that keeps every view inside the margin, so the boat has the same size in each picture. The image size and margin are the SUV's
- The boat's cube x rotations are negated before drawing, so the tower struts, the helm display, and the jet bucket hoods lean the way they do in game
- Faces whose texel alpha is below 255 are drawn see-through: blended over whatever opaque surface is behind them, farthest first
- The water is a see-through blue plane at the waterline, 7.2 model pixels (0.45 blocks) above the feet, in 10 layers that fade out 14 pixels beyond the hull's footprint. The hull below the waterline shows through it. With the headlights on, a beam lies on the water ahead of the lamps, 40 pixels long, with the SUV's dusk tint, spread, and bloom
- Everything else in 0016 and 0027 stays: the standard library only, no `math.sin` or `math.cos`, a transparent background, and `pnpm model:check` comparing decoded pixels of every image in CI

## Consequences

- A change to the boat model or its paint textures updates the boat pictures with `pnpm model`, and `pnpm model:check` fails in CI if any is stale
- The SUV previews and the pack icons render to the same pixels as before
- The water and the beam are illustrations, not how the game renders them
- Rendering takes longer: `pnpm model:check` with the boat runs in about 21 seconds on a Mac
