# 0049. Render pack icons from the hovering SUV model

- Status: Accepted
- Date: 2026-10-12

## Context

All three packs show Minecraft's placeholder because they have no pack icon. The model renderer already supplies deterministic README previews (0027, 0045), including the folded-wheel flying pose. A separate illustration would drift away from the model.

## Decision

- Extend `tools/render_preview.py` with `--icons <pack dir> ...`, using the same model, flying pose, camera, and supersampled rasterizer as the previews. Keep the preview pixels unchanged
- Render a 256 by 256 RGB icon with the headlights on and the vehicle occupying 80% of its width, without text, logos, or badges (0009)
- Use charcoal `#16181C`, an orange `#F28C28` diagonal band 18% of the image height, and cyan `#5AD7FF` discs beneath the folded wheels. Disc alpha falls linearly from 0.9 at the center to zero at 1.6 times the wheel radius; composite them behind the vehicle. Each disc is a circle on screen centered under the wheel, on the projected bottom center of its `glow_*` plate, not a disc lying flat under it, because from the camera above a flat disc hides behind the folded wheel
- Give the release packs identical icons and the test pack a grayscale copy. `pnpm model` writes all three; `pnpm model:check` compares decoded pixels alongside the previews

## Consequences

Model changes update both the README and pack list illustrations. The test pack is distinguishable by color. Rendering adds work to the existing model checks but needs no dependency. Resource Pack icon changes require the usual manifest version bump (0015). Revisit the shared SUV icon when another ride needs representation.
