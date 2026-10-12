# 0062. Serve the dev BDS's packs under a fresh dev-only version on every start

- Status: Accepted
- Date: 2026-10-12
- Extends: 0015

## Context

Bedrock clients cache a Resource Pack by its UUID and version. When a server offers a pack whose UUID and version the device already holds, the device uses its cached copy and does not download the pack again. 0015 handles this for releases: bump the Resource Pack version whenever it changes. The dev BDS, however, served whatever version the checkout's committed manifest carried.

On 2026-10-12, the dev BDS served a Resource Pack with the sports boat's bow rise flipped under 0.1.45, while `main` had already released a different 0.1.45 with the engine sound (0060). The player's device had cached `main`'s 0.1.45, so it kept showing the old animation, and every in-game check of the flip gave a wrong result until the pack was served under a version no one had used. Bumping the committed version by hand on a branch does not prevent this: another branch or a later release can pick the same number, and one device sees every branch's dev server.

## Decision

- The committed `packs/*/manifest.json` files are never changed to serve the dev BDS
- `scripts/setup-dev-world.mjs`, which `pnpm server:up` runs before `docker compose up`, computes a dev-only version and writes rewritten manifests to `server/data/dev-manifests/` (gitignored with the rest of `server/data/`):
  - `yasu_ride_rp/manifest.json`: the Resource Pack manifest with `header.version` and every module version set to the dev version
  - `yasu_ride_bp/manifest.json`: the Behavior Pack manifest with its dependency on the Resource Pack (`b5d52b53-d112-4da1-9c1a-b95db192f94a`) set to the dev version
  - Everything else in both manifests stays as committed. The test Behavior Pack does not depend on the Resource Pack and is served as committed
- The dev version is `[major, minor, 10000 + counter]`: major and minor from the committed Resource Pack manifest, and a counter in `server/data/dev-pack-version.json` that goes up by one on every run. A missing or unreadable state file starts the counter at 1. Releases bump the patch one at a time from small numbers (0.1.50), so a patch of 10001 or more never matches a release, and each start serves a version that no earlier start in this checkout has served
- The world's `world_resource_packs.json` and `world_behavior_packs.json` are written from the same generated manifests, so the world registration and the served packs always agree
- `server/compose.yaml` keeps the directory bind mounts of the packs, so `pnpm build` and `/reload` still pick up script changes live, and adds read-only single-file bind mounts of the generated manifests over `/data/resource_packs/yasu_ride_rp/manifest.json` and `/data/behavior_packs/yasu_ride_bp/manifest.json`. They set `create_host_path: false`, so `docker compose up` fails when the manifests were not generated instead of mounting an empty directory
- `pnpm server:restart` runs `docker compose -f server/compose.yaml down` and then the `pnpm server:up` flow. Restarts go through it, not `docker restart`, so the version goes up

## Consequences

- A device always downloads the Resource Pack again after `pnpm server:up` or `pnpm server:restart`, even when nothing changed. The pack is small and the server is on the LAN, so this costs little
- A `docker restart` or `docker compose restart` keeps the previous dev version. That is harmless when the Resource Pack did not change, and wrong when it did, so AGENTS.md says to use `pnpm server:restart`
- Each checkout and worktree has its own `server/data/` and so its own counter. Two checkouts that serve the dev BDS to the same device can still reach the same dev version, for example 0.1.10003 in both. Revisit, for example by adding a per-checkout offset or a timestamp, if that happens in practice
- If the committed major or minor goes down, a dev version can repeat one served before. Releases only go up, so this is not expected
- The CI in-game tests run `scripts/setup-dev-world.mjs` before `docker compose up`, as before, so they get the generated manifests too
- Release checks (`scripts/check-rp-version.mjs`, 0015) still read the committed manifests and are unaffected
