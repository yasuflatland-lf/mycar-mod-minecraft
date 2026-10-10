# 0013. Keep dependencies up to date with Renovate

- Status: Accepted
- Date: 2026-10-11

## Context

Dependencies are pinned to exact versions in `package.json`, and the Node and pnpm versions are pinned in `mise.toml` and `packageManager`. GitHub Actions are referenced by major tag. Updating all of these by hand gets skipped, and a compromised release is most likely to be caught and pulled within its first days on the registry.

## Decision

- Use Renovate, configured in `renovate.json`, for npm packages, `mise.toml`, and GitHub Actions
- Propose an update only after the release is at least 3 days old (`minimumReleaseAge`, with `internalChecksFilter: strict` so no branch is opened before then)
- Merge minor, patch, pin, and digest updates automatically once CI passes
- Leave major updates for a human to review and merge
- Security fixes, from GitHub vulnerability alerts and OSV, skip the 3-day wait. They still follow the rules above: minor and patch fixes merge automatically, major fixes wait for review
- Update pnpm in `mise.toml` and `packageManager` together in one PR

## Consequences

- Automerge relies on CI being the gate, so CI must keep covering lint, typecheck, test, and build
- Renovate needs the Renovate GitHub App installed on the repository, and vulnerability alerts need Dependabot alerts enabled
- pnpm's own default minimum release age (1 day) still applies when Renovate regenerates the lockfile, so a security fix published less than a day ago fails until it is a day old, or until it is added to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`
- Revisit the 3-day wait if it delays fixes we need, or if a compromised release slips through it
