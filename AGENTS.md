# AGENTS.md

Guidance for coding agents (Codex, Claude Code, and others) working in this repository. Human contributors follow the same rules. [README.md](README.md) covers what the project is; this file covers how to work on it.

## Project

A vehicle add-on for Minecraft Bedrock Edition: a Behavior Pack and a Resource Pack driven by the stable Script API (`@minecraft/server` 2.x), written in TypeScript and bundled with esbuild. It targets a Bedrock Dedicated Server (BDS) on a home LAN, played from PC (keyboard) and mobile (touch).

The source lives in `src/` (domain, application, infrastructure, and the in-game test pack in `src/test-pack/`), with unit tests in `tests/`. `pnpm build` bundles it into `packs/yasu_ride_bp` and `packs/yasu_ride_test_bp`. The in-game tests (`pnpm test:game`) run against the dev BDS in Docker, so they need `pnpm server:up` first.

## Commands

Node and pnpm are pinned in `mise.toml`; run `mise install` first.

```sh
pnpm install --frozen-lockfile
pnpm lint          # Biome format + lint check (CI runs `biome ci`)
pnpm lint:fix      # apply Biome fixes
pnpm lint:lang     # fail on Japanese/CJK text in tracked and unignored files
pnpm lint:unused   # knip: fail on unused files, exports, and dependencies
pnpm lint:deps     # dependency-cruiser: fail on imports that break the layer, feature, or kind rules
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest + fast-check
pnpm test:coverage # same, with a coverage report in coverage/ (CI uploads it to Codecov)
pnpm test:mutation # Stryker mutation testing, report in reports/mutation (not in CI)
pnpm build         # esbuild bundle into the Behavior Pack and the test pack
pnpm package       # zip the packs into dist/yasuflatland-ride-<version>.mcaddon (after build)
pnpm model         # regenerate the Resource Pack model, the README previews, and the pack icons (Python 3)
pnpm model:check   # fail if the README previews in docs/images or the pack icons are stale
pnpm sounds        # regenerate the Resource Pack sounds (Python 3)
pnpm server:up     # register the packs and start the dev BDS (Docker)
pnpm server:down   # stop the dev BDS
pnpm server:restart # stop the dev BDS and start it again under a new dev pack version
pnpm test:game     # run the in-game tests on the running dev BDS (GAME_TEST_SHARD=2/3 runs one CI slice)
```

Before you say a change is done, run `pnpm lint`, `pnpm lint:lang`, `pnpm lint:unused`, `pnpm lint:deps`, `pnpm typecheck`, and `pnpm test`. When you change `src/infrastructure`, `src/test-pack`, or the packs, also run `pnpm build`, restart the dev BDS, and run `pnpm test:game` if Docker is available. CI runs the lint, unused code, test, build, and package checks on every pull request ([unit-test.yml](.github/workflows/unit-test.yml), which also uploads coverage to Codecov) and runs the in-game tests against a BDS container ([integration-test.yml](.github/workflows/integration-test.yml)).

## Language and comments

- Write everything committed to the repository in English: code, identifiers, comments, test names, commit messages, and docs. Pull request titles and descriptions must be in English too; issues are not covered. `pnpm lint:lang` enforces this for files in CI, and [pr-language.yml](.github/workflows/pr-language.yml) checks the title and description of every pull request. Resource Pack translations for other locales (`texts/<locale>.lang`) are the only exception.
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
- **Three layers with one-way dependencies (0012):** `src/infrastructure` → `src/application` → `src/domain`. Only `src/infrastructure` may import `@minecraft/server`. `src/main.ts` only calls `bootstrap()`. `pnpm lint:deps` (`.dependency-cruiser.cjs`) checks the import graph (0065). `src/test-pack/` sits outside the layers.
- **Feature boundaries ([0046](docs/adr/0046-organize-each-layer-by-feature.md)).** Every layer file lives in a feature folder or `shared/`, except `infrastructure/bootstrap.ts`. Features cannot import other features, and shared code cannot import features. All driven entities, including boats, belong to `vehicle`. Wire each feature through its infrastructure install function.
- **Vehicle kinds ([0055](docs/adr/0055-kind-neutral-vehicle-core.md)).** Keep the shared core in `src/domain/vehicle/`, movement building blocks in `motion/`, and each kind in `src/domain/vehicle/kinds/<kind>/`. Kinds talk to the engine only through engine commands and declare an entity contract. Kinds cannot import other kinds. The core and motion cannot import kinds, and the core cannot import motion. Application and infrastructure import kinds only through `kinds/index.ts`. `kind.ts` imports nothing. `pnpm lint:deps` enforces these rules in the three layers; `src/test-pack/` is excluded (0065).
- **Movement is script-driven (0002).** The script sets velocity every tick. Each tuning value lives in one place: `SPEC` for the core, `MOTION` in `motion/constants.ts` for shared motion, and `kinds/<kind>/spec.ts` for kind tuning (`SUV_SPEC` for the SUV; the boat keeps its values in its profile and drive). Do not scatter magic numbers.
- **Per-vehicle parameters ([0050](docs/adr/0050-vehicle-kinds-and-per-kind-profiles.md)).** When a new kind of vehicle, such as the boat, needs a value that differs from the SUV (speed, acceleration, body size, ram reach, seats, lights, placement, paint), first refactor so that the value is set per vehicle type with the SUV's behavior unchanged, in its own commit or pull request, and only then implement the new vehicle on top. Do not reuse an SUV constant for another vehicle, and do not branch on the vehicle type inside shared logic to work around a missing parameter.
- **Testing (0010).** Pure logic gets property-based tests (fast-check + vitest) with only a few example tests. Integration with the game is covered by in-game tests started with `scriptevent`, not by GameTest.
- **Model conventions (0009).** The front of an entity is the model's -z side. Bone names (`root`, `body`, `headlights`, `wheel_*`, `door_*`, `seat_0`–`seat_3`) are a fixed contract between the model and the scripts. Give the grille eight slots (a seven-slot grille is a Jeep trademark), with no logo or vehicle name.

## Changing a decision

- When a change goes against an Accepted ADR, or makes a design choice that is not recorded yet, add a new ADR. Follow "Writing a new ADR" in [docs/adr/README.md](docs/adr/README.md).
- Do not rewrite the Decision of an Accepted ADR. Supersede it with a new ADR instead. Fixing typos and adding links is fine.

## Bedrock gotchas

- Bump the Resource Pack manifest version whenever the Resource Pack changes. Otherwise devices keep using their cached copy (0015).
- Script-only changes reload with `/reload`. Entity definition and Resource Pack changes need a server restart (0015).
- The dev BDS serves the Resource Pack, and the Behavior Pack's dependency on it, under a fresh dev-only version on every `pnpm server:up` and `pnpm server:restart`: the committed major and minor with patch 10000 plus a counter kept in `server/data/dev-pack-version.json`. The committed manifests stay unchanged; the served ones are generated into `server/data/dev-manifests/`. Restart through `pnpm server:restart`, not `docker restart` or `docker compose restart`, so the version goes up and devices drop their cached copy (0062).
- Start the dev BDS with `pnpm server:up`, not `docker compose up`. It uses NetherNet: TCP 19132 for signaling, and UDP 19140-19155 advertised on the Mac's LAN IP (`BDS_LAN_IP`, detected when unset). Without that advertisement, clients behind Docker's bridge network cannot reach their UDP port. `BDS_TRANSPORT=raknet` falls back to raknet on UDP 19132; ignore its "NetherNet is the only supported transport type" banner (0015).
- Mobs spawned with `dimension.spawnEntity` far from players disappear within a tick, so tests use `summon`. `fill` is capped at 32,768 blocks per call (0010).

## Git and pull requests

- Branch names use a type prefix: `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`, `ci/`, `spike/`.
- Commit messages are a single imperative line with no body or trailers, for example `Add Biome for formatting and linting, and run it in CI`. Do not add AI attribution (`Co-Authored-By`, "Generated with ...") to commits or PR descriptions.
- Pin exact dependency versions. pnpm's default minimum release age rejects versions published too recently; pick an older release instead of loosening the setting.
- Never commit world data (`server/data/`, `spike/server/data/`), `node_modules/`, or `dist/`.

## Naming and adding a new kind of content

Ship all rides in Yasuflatland Ride: `yasuflatland-ride-minecraft`, with `yasu_ride_bp` and `yasu_ride_rp`; `yasu_ride_test_bp` is for development only. The dev container is `yasuflatland-ride-bds` and its world is `yasuflatland-ride-dev`.

House-building parts ship as a separate add-on with their own namespace. Do not change the `yasu_ride` namespace after the first Yasuflatland Ride release (0047).

Use `yasu_ride:<snake_case>` for IDs, properties, groups, and events; the test entity namespace is `yasu_ride_test:`. Geometry names use `geometry.yasu_ride.<name>`, animations use `animation.yasu_ride.<entity>.<name>`, controllers use `controller.<kind>.yasu_ride.<entity>[.<name>]`, and sounds use `yasu_ride.<name>`. Lang keys follow IDs. Item texture shortnames use `yasu_ride_<name>` and the atlas resource pack name is `yasu_ride`. Keep engine-fixed manifest, lang, atlas, and sound definition files at their required paths (0047).

When adding a new kind of content, place its code by the feature boundaries rule above (0046), and:

- Build identifiers with `id()` from `src/infrastructure/shared/identifiers.ts`.
- Put pack files under `<type>/yasu_ride/`, flat below the namespace folder; test entities go under `entities/yasu_ride_test/`. Use the short type suffixes from 0047 (`suv.se.json`, `suv.ce.json`, `suv.ac.json`, ...), and keep every path within 80 characters counting the pack folder (a console limit). `tests/packs/layout.test.ts` enforces this layout and the path length.
