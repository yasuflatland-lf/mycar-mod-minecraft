# 0027. Render the README previews in three poses

- Status: Superseded in part by 0045 (a fourth, submarine pose)
- Date: 2026-10-11

## Context

0016 renders one README preview, the vehicle on the ground, from the model files, and 0022 kept it in that form by skipping the `glow_*` bones. Since then the vehicle gained headlights (0020, 0024) and flight with folded wheels (0021, 0022). A reader of the README cannot see either from the single picture, and an in-game screenshot would go stale the same way 0016 describes.

## Decision

- `tools/render_preview.py <resource pack> <output dir>` writes three images into `docs/images`: `suv-front-left.png` (on the ground, as before), `suv-headlights.png` (headlights on), and `suv-flying.png` (flying). The README shows them side by side
- All three use one camera and one scale, fitted to the union of the three scenes, so the vehicle has the same size and position in each and the flying one sits 1.5 blocks higher, the takeoff height of 0021
- Headlights: the `headlights` bone is drawn unshaded in a warm white, the rest of the vehicle is dimmed and tinted blue for dusk, and a widening pool of warm light lies on the ground ahead. The pool stops about 2 blocks out instead of the real 27 (0024), so the vehicle keeps its size
- Flying: the wheels take the `animation.mycar.suv.wheels_folded` pose read from `suv.animation.json`, the `glow_*` discs are drawn, small blue pools lie on the ground under each disc, and the shadow is fainter. This replaces the rule of 0022 that the preview skips `glow_*`
- Emissive faces get a bloom: a box blur, 3 passes of radius 6 output pixels, added to the image. The lamps bloom only where they are visible. The discs sit under the folded tires and cannot be seen from above, so their bloom is drawn through the vehicle but only added where the vehicle does not cover the pixel
- Everything else in 0016 stays: the standard library only, no `math.sin` or `math.cos`, a transparent background, and `pnpm model:check` comparing decoded pixels of every image in CI

## Consequences

- A change to the model, its texture, or the folded-wheel animation updates all three pictures with `pnpm model`, and CI fails if any of them is stale
- The headlight and flight pictures are illustrations: the light pools, the dusk tint, and the bloom are not how the game renders them
- Rendering takes about three times as long as one image (about 6 seconds on a Mac)
- The images are 800×600 and show empty space around the ground poses, because the frame also fits the flying vehicle and the light ahead
