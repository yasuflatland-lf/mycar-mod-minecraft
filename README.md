# 🚗 mycar-mod-minecraft

A vehicle add-on for Minecraft Bedrock Edition, inspired by [MrCrayfish's Vehicle Mod](https://www.curseforge.com/minecraft/mc-mods/mrcrayfishs-vehicle-mod). It is built as a Behavior Pack + Resource Pack driven by the stable Script API (`@minecraft/server` 2.x), with no experimental toggles required.

The target setup is a Bedrock Dedicated Server on a home LAN, with players joining from PC (keyboard) and mobile (touch).

## Status

Work in progress. The first milestone is the **driving core**:

- Getting in and out, with a driver seat and passenger seats
- Arcade-style acceleration, inertia, and steering
- Climbing steps up to two blocks high
- Spinning wheels and body tilt
- Ram damage to mobs, while keeping occupants safe
- Placing a vehicle from an item and breaking it back into one

The manual test checklist is in [`docs/manual-test.md`](docs/manual-test.md).

## Design

Design decisions are recorded as ADRs in [`docs/adr`](docs/adr/README.md). Highlights:

- Movement is script-driven: the script sets the vehicle's velocity every tick ([0002](docs/adr/0002-script-driven-vehicle-movement.md))
- Touch joystick input is scaled so pushing it halfway forward gives full throttle, matching keyboard players ([0005](docs/adr/0005-touch-throttle-compensation.md))
- Code is split into domain, application, and infrastructure layers so the driving logic does not depend on `@minecraft/server` ([0012](docs/adr/0012-ddd-layered-architecture.md))

## Development

Node and pnpm versions are pinned in `mise.toml`. Install [mise](https://mise.jdx.dev/), then run:

```sh
mise install
pnpm install
pnpm lint            # format and lint check with Biome
pnpm test            # unit tests, property-based tests, and the layer dependency check
pnpm build           # bundle the TypeScript into the Behavior Pack
pnpm package         # zip the packs into dist/mycar-<version>.mcaddon (run after build)
pnpm model           # generate the vehicle model and texture
pnpm server:up       # start the dev BDS in Docker
pnpm test:game       # in-game tests
```

CI runs the Biome check, type checking, tests, the build, and packaging on every pull request.

## Releasing

Push a `v*` tag that matches the Behavior Pack version in `packs/mycar_bp/manifest.json` (for example `v0.1.0` for `[0, 1, 0]`). The release workflow runs the checks, builds `mycar-<version>.mcaddon`, and attaches it to a new GitHub Release. Opening the file on a device imports both packs into Minecraft.

## License

[MIT](LICENSE)
