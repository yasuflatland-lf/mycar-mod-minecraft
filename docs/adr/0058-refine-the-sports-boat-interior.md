# 0058. Refine the sports boat interior from reference photos

- Status: Accepted
- Date: 2026-10-12

## Context

The sports boat (0051) started from the spike's model: forward-facing mid benches and aft lounges in two rows, a bow lounge without trim, a 5-pixel walk-through, a thin three-spoke wheel, a display outboard of the wheel, and box speakers under the tower beam. Reference photos of a current wake boat show a different layout and more detail. The cockpit has a U-shaped aft lounge and wraparound helm buckets with flip-up bolsters. The helm has a large display inboard of the wheel and a broad three-spoke wheel pad. The bow lounge can be closed into a sun pad with filler cushions, the walk-through is 22 inches wide, and bullet-shaped speaker pods with blue LED rings sit under the rear edge of the top.

## Decision

- Replace the aft rows with a U lounge: a bench across the transom, side benches along the hull from z -38 to -17 facing inboard (inboard edge 9.4 px from the center line), and at their front ends forward-facing seats with flip-back backrests on steel hinges. Seats 2 and 3 stay on those forward-facing seats, so the rider positions in `sportsboat.se.json` and the profile do not change
- Give the helm and passenger buckets a charcoal shell, tall tan wings, a headrest, and a flip-up bolster, folded down, at the front of the cushion
- Trim the bow lounge with charcoal piping and a charcoal cap on the backs. From z 26 forward, fill the aisle with filler cushions into one sun pad, leaving the floor inside the walk-through open
- Widen the walk-through to 7 px (22 inches at this scale, where 96 px is 25 feet), with the consoles' inboard edges at ±3.5 px. Show the walk-through door closed, its glass leaning back in line with the front panes under the top rail. Add a divider halfway across each front pane and a rear-view mirror over the helm half of the top rail
- Move the display inboard of the wheel, overhanging the console toward the aisle, and add a phone holder, a switch panel, two chrome-rimmed cupholders, and a tan panel on each side wall beside the front seats. Move the wheel 1.35 px outboard and 1.2 px aft to make room
- Build the wheel from a thick round rim of 40 short segments, with thinner bands along its inner and outer edges to round its cross-section, and a broad three-spoke pad at 20, 160, and 270 degrees, with chrome strips along the lower edges of the side spokes, small buttons, one blue LED, and a plain silver cap with no emblem (0009). Put it on a thick glossy column cowl with a chrome band
- Remove the box speakers under the tower beam. Set two bullet-shaped gunmetal pods under the top near its rear edge, a quarter of the way in from each side, facing aft. Each has a bezel, a blue LED ring, and a grille of split spokes round a hub. Add two ribs under the top, and a round chrome speaker grille in each side back of the U lounge
- Replace the quilted tile's diamond lattice with a honeycomb stitch, and add the `gunmetal`, `chrome`, and `button` swatches
- Write cube z rotations in the generator's right-handed sense and keep them as they are when the model is turned around. The game turns a cube's z rotation the other way, as it does the x rotation (0051), so the rim segments, spokes, and grille spokes came out tilted the wrong way in game while the preview showed them right. `tools/render_preview.py` now negates z rotations as well as x rotations for the boat
- Keep the colors of 0051: the reference photos of white and blue boats only set shapes

## Consequences

- The model grows from 906 to 1231 cubes
- The previews in `docs/images` change, and the Resource Pack version goes up to 0.1.43 (0015)
- The honeycomb tile is 8 by 8 texels stretched over each quilted face, so on a large cushion it reads as a coarse pattern rather than fine stitching
- The closed door and the filler cushions are fixed geometry. Riders cannot open the door or remove the cushions
- In-game checks still to do: whether the wheel and display read clearly from the driver's view, and whether the speaker pods' LED rings show under the top in daylight
