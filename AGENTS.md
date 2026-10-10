# AGENTS.md

Guidance for coding agents (Codex, Claude Code, and others) working in this repository. Human contributors follow the same rules. [README.md](README.md) covers what the project is; this file covers how to work on it.

## Project

A vehicle add-on for Minecraft Bedrock Edition: a Behavior Pack and a Resource Pack driven by the stable Script API (`@minecraft/server` 2.x), written in TypeScript and bundled with esbuild. It targets a Bedrock Dedicated Server (BDS) on a home LAN, played from PC (keyboard) and mobile (touch).

`main` currently holds tooling, CI, and the design docs only. The driving-core source arrives through the stacked `feat/driving-core-NN-*` branches. Several `package.json` scripts (`build`, `typecheck`, `test`, `model`, `server:*`) point at files that exist only on those branches, and `test:game` has no script on any branch yet, so check that a file exists before relying on a script that uses it. Those branches predate the pnpm, Biome, and English-only setup on `main`; when you bring one onto `main`, move it to pnpm and translate its comments, test names, and docs so that CI passes.

## Commands

Node and pnpm are pinned in `mise.toml`; run `mise install` first.

```sh
pnpm install --frozen-lockfile
pnpm lint          # Biome format + lint check (CI runs `biome ci`)
pnpm lint:fix      # apply Biome fixes
pnpm lint:lang     # fail on Japanese/CJK text in tracked and unignored files
pnpm typecheck     # once tsconfig.json exists
pnpm test          # vitest + fast-check, once source exists
pnpm build         # esbuild bundle into the Behavior Pack
```

Before you say a change is done, run `pnpm lint` and `pnpm lint:lang`, plus `pnpm typecheck` and `pnpm test` when source code is present. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the same checks on every pull request.

## Language and comments

- Write everything committed to the repository in English: code, identifiers, comments, test names, commit messages, and docs. PR descriptions and issues are not covered. `pnpm lint:lang` enforces this in CI. Resource Pack translations for other locales (`texts/<locale>.lang`) are the only exception.
- Talking to the user in their own language is fine. Only what lands in the repository has to be English.
- A comment must add something the code cannot say: why it is done this way, a constraint the engine imposes, a measured value, or a link to the ADR behind it. Do not write comments that repeat what the code already says. Prefer a clearer name over a comment.

```ts
// Bad: restates the code
// Multiply the velocity by the friction factor
velocity = velocity.scale(friction);

// Good: explains a constraint the code cannot show
// The engine already zeroes velocity on an axis that hits a wall, so a sharp
// drop on one axis means a collision, not stronger friction (ADR 0003).
```

## Architecture rules

Design decisions live in [docs/adr](docs/adr/README.md). Read the ADRs that relate to the area you are changing before you change it. The rules that are easiest to break:

- **Stable APIs only (0001).** Do not use beta Script APIs, experimental toggles, or `@minecraft/server-gametest`.
- **Three layers with one-way dependencies (0012):** `src/infrastructure` → `src/application` → `src/domain`. Only `src/infrastructure` may import `@minecraft/server`. `src/main.ts` only calls `bootstrap()`. `tests/architecture.test.ts` checks the import graph. `src/test-pack/` sits outside the layers.
- **Movement is script-driven (0002).** The script sets velocity every tick. Tuning values live in one place in the domain; do not scatter magic numbers.
- **Testing (0010).** Pure logic gets property-based tests (fast-check + vitest) with only a few example tests. Integration with the game is covered by in-game tests started with `scriptevent`, not by GameTest.
- **Model conventions (0009).** The front of an entity is the model's -z side. Bone names (`root`, `body`, `wheel_*`, `door_*`, `seat_0`–`seat_3`) are a fixed contract between the model and the scripts. Give the grille eight slots (a seven-slot grille is a Jeep trademark), with no logo or vehicle name.

## Changing a decision

- When a change goes against an Accepted ADR, or makes a design choice that is not recorded yet, add a new ADR. Follow "Writing a new ADR" in [docs/adr/README.md](docs/adr/README.md).
- Do not rewrite the Decision of an Accepted ADR. Supersede it with a new ADR instead. Fixing typos and adding links is fine.

## Bedrock gotchas

- Bump the Resource Pack manifest version whenever the Resource Pack changes. Otherwise devices keep using their cached copy (0011).
- Script-only changes reload with `/reload`. Entity definition and Resource Pack changes need a server restart (0011).
- The dev BDS must use `TRANSPORT: raknet` on port 19132. The default `nethernet` transport picks a random port that Docker cannot forward (0011).
- Mobs spawned with `dimension.spawnEntity` far from players disappear within a tick, so tests use `summon`. `fill` is capped at 32,768 blocks per call (0010).

## Git and pull requests

- Branch names use a type prefix: `feat/`, `fix/`, `docs/`, `chore/`, `ci/`, `spike/`.
- Commit messages are a single imperative line with no body or trailers, for example `Add Biome for formatting and linting, and run it in CI`. Do not add AI attribution (`Co-Authored-By`, "Generated with ...") to commits or PR descriptions.
- Pin exact dependency versions. pnpm's default minimum release age rejects versions published too recently; pick an older release instead of loosening the setting.
- Never commit world data (`server/data/`, `spike/server/data/`), `node_modules/`, or `dist/`.
