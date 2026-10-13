# 0063. Show the sports boat previews from the rear and from above

- Status: Accepted
- Date: 2026-10-13

## Context

The four sports boat previews (0056) all look at the boat from the same front-left corner, and two of them only change the hull paint. A reader sees the bow and the cockpit but never the stern deck, the swim platform, or the deck layout, and the paints are easy to picture without a picture of their own.

## Decision

- `tools/render_preview.py` writes four boat images into `docs/images`: `sportsboat-afloat.png` and `sportsboat-headlights.png` as before, `sportsboat-rear.png` seen from the rear-left corner, and `sportsboat-top.png` seen from straight above with the bow to the right. All four use the default black texture; `sportsboat-red.png` and `sportsboat-white.png` are removed
- The rear view mirrors the SUV's view direction front to back, `(-1, 0.65, 1)`. The top view looks along `(0, 1, 0)` with the world's -x pointing up in the image, so the long hull fills the landscape frame
- Poses seen from the same direction share one frame. Each view is centered on its own, and all four share one scale, the largest that keeps every view inside the margin, so the boat has the same size in each picture
- Everything else in 0056 stays

## Consequences

- The README and the boat page show the stern and the deck plan; the red and white paints are no longer pictured
- The SUV previews and the pack icons render to the same pixels as before
- `pnpm model:check` takes about as long as before, since the number of boat images is unchanged
