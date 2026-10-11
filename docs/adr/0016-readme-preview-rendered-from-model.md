# 0016. Render the README preview from the model files

- Status: Superseded by 0027
- Date: 2026-10-11

## Context

We want the README to show the vehicle from its front-left corner (the vehicle's own left, 45 degrees off the front). A screenshot taken in game looks best, but someone has to retake it by hand every time `tools/gen_model.py` changes the model, and nothing tells us when it has gone stale.

The model is made only of axis-aligned cubes (a few of them rotated around one axis), and every face is a single color from the swatch texture (0009). That is simple enough to draw without a 3D engine.

## Decision

- `tools/render_preview.py` draws `docs/images/suv-front-left.png` from `suv.geo.json` and `suv.png`, using only the Python standard library, like `tools/gen_model.py`. It uses Minecraft's fixed face shading (top 1.0, north/south 0.8, east/west 0.6, bottom 0.5), a soft ground shadow, and a transparent background
- `pnpm model` regenerates the preview right after the model. `pnpm model:check` renders it again and fails if the pixels differ from the committed image; CI runs it on every pull request
- The renderer avoids `math.sin` and `math.cos`, whose last bit can differ between platforms, so a Mac and the Linux CI runner produce identical pixels. The check compares decoded pixels, not PNG bytes, because zlib builds do not all compress identically

## Consequences

- A model change that forgets the preview fails CI, and `pnpm model` fixes it
- The preview does not show in-game lighting, sky, or terrain
- The renderer samples one texel per face. A Blockbench model with detailed textures (0009) needs real texture mapping in the renderer before the preview will look right
