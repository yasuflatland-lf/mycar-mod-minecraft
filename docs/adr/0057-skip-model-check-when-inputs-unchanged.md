# 0057. Skip model:check on pull requests that leave the renderer's files alone

- Status: Accepted
- Date: 2026-10-12

## Context

0054 moved `pnpm model:check` into its own `model` job beside the unit tests, where it took about 27 s. The sports boat previews (0056) add four more images, and the check now runs in about 21 s on a Mac, longer on the CI runner. Most pull requests change scripts, tests, or docs, none of which the renderer reads, so they cannot make the previews or the pack icons stale.

## Decision

- On a pull request, the `model` job checks out with depth 2 and lists the files the merge commit changes against its base (`HEAD^1`). It runs `pnpm model:check` only when one of them matches the renderer's inputs or outputs: `tools/render_preview.py`, `packs/yasu_ride_rp/models/`, `packs/yasu_ride_rp/textures/entity/`, `packs/yasu_ride_rp/animations/`, any pack's `pack_icon.png`, `docs/images/`, `package.json` (the script line), `mise.toml` (the Python version), or `.github/workflows/unit-test.yml`
- Otherwise the job skips mise and the render and succeeds, so the required `check` job still passes without a change to the ruleset
- A push to `main` always runs the check

## Consequences

- Pull requests that do not touch the model finish the `model` job in a few seconds
- A new renderer input outside these paths must be added to the pattern, or a change to it could merge with stale images until the next push to `main` catches it
- `tools/gen_model.py` and `tools/gen_sportsboat.py` are not in the pattern: a change to them reaches the previews only through the model and texture files they write, which are
