# Releasing

Bump the Behavior Pack version in `packs/yasu_ride_bp/manifest.json` and write the release summary in `docs/releases/v<version>.md`, starting from [`docs/releases/TEMPLATE.md`](releases/TEMPLATE.md). Describe what players can do now in plain words; the release workflow puts it above the PR list that GitHub generates, and fails if the file is missing. The Resource Pack depends on the Behavior Pack version, so update that dependency in `packs/yasu_ride_rp/manifest.json` too; this changes the Resource Pack, so also bump its version and the Behavior Pack's dependency on it (ADR 0015). `tests/packs/resourcePack.test.ts` fails if the Resource Pack's dependency differs from the Behavior Pack version, or if the Behavior Pack's dependency differs from the Resource Pack version. The release workflow fails when the Resource Pack changed since the last release without a version bump. Merge these changes to `main`, then either:

- open **Actions → Release → Run workflow** on `main`, which tags the commit as `v<version>` (for example `v0.1.0` for `[0, 1, 0]`), or
- push a matching tag yourself: `git tag v0.1.0 && git push origin v0.1.0`.

The release workflow runs the checks, builds `yasuflatland-ride-<version>.mcaddon`, and attaches it to a new GitHub Release. Opening the file on a device imports both packs into Minecraft.
