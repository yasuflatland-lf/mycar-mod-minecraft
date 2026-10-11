# 0045. Add a submarine pose to the README previews

- Status: Accepted
- Date: 2026-10-11

## Context

The README shows the SUV on the ground, with its headlights on, and flying (0027). The submarine form (0040) changes the look as much as flight does, with sealed windows, turned rear wheels, propellers and arms (0042, 0043), but 0040 left those bones out of the previews.

## Decision

- `tools/render_preview.py` writes a fourth image, `docs/images/suv-submarine.png`, with the same camera and scale as the other three, fitted to the union of all four scenes. The README shows it as a fourth column, "Under water"
- In that pose the rear wheels and props take the rotation and position of `animation.mycar.suv.submerged`, turned the right-handed way the hub test in `tests/packs/resourcePack.test.ts` pins from the game, and moved along the model's axes (0043). The props' spin is a Molang expression and is drawn at rest
- The pose shows `windows_sealed`, the props, the submarine arms and the rear glass, as the render controller and the form controller do in game, and hides the glow discs and the flight arms
- Every surface takes a blue-green tint, `WATER_TINT` (0.55, 0.78, 0.92), over a translucent blue-green seabed that fades out from the vehicle's footprint

## Consequences

- A change to the model or to the submerged animation updates the fourth picture with `pnpm model`, and `pnpm model:check` fails in CI if it is stale
- Seen from the front-left, the props on the rear faces of the wheels are out of sight; the arms and the turned tires show the form
- Rendering takes about a third longer
