# <img src="packs/yasu_ride_rp/pack_icon.png" width="64" alt="Hovering SUV pack icon"> Yasuflatland Ride

[![Unit Tests](https://github.com/yasuflatland-lf/yasuflatland-ride-minecraft/actions/workflows/unit-test.yml/badge.svg?branch=main)](https://github.com/yasuflatland-lf/yasuflatland-ride-minecraft/actions/workflows/unit-test.yml)
[![Integration Test](https://github.com/yasuflatland-lf/yasuflatland-ride-minecraft/actions/workflows/integration-test.yml/badge.svg?branch=main)](https://github.com/yasuflatland-lf/yasuflatland-ride-minecraft/actions/workflows/integration-test.yml)
[![all code coverage](https://img.shields.io/codecov/c/github/yasuflatland-lf/yasuflatland-ride-minecraft/main?label=all%20code&logo=codecov)](https://codecov.io/gh/yasuflatland-lf/yasuflatland-ride-minecraft)
[![domain and application coverage](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.codecov.io%2Fapi%2Fv2%2Fgithub%2Fyasuflatland-lf%2Frepos%2Fyasuflatland-ride-minecraft%2Fcomponents%2F%3Fbranch%3Dmain&query=%24%5B0%5D.coverage&suffix=%25&label=domain%20and%20application&logo=codecov&color=brightgreen)](https://app.codecov.io/gh/yasuflatland-lf/yasuflatland-ride-minecraft/components)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

| SUV on the ground | Headlights on | Flying | Under water |
|:---:|:---:|:---:|:---:|
| ![The SUV on the ground, seen from its front-left corner](docs/images/suv-front-left.png) | ![The SUV with its headlights on, lighting the ground ahead](docs/images/suv-headlights.png) | ![The SUV flying with its wheels folded flat on gunmetal arms and glowing blue underneath](docs/images/suv-flying.png) | ![The SUV as a submarine, with sealed blue windows and its rear wheels turned backward on gunmetal arms](docs/images/suv-submarine.png) |
| **Sports boat on the water** | **Headlights on** | **From the rear** | **From above** |
| ![The black sports boat afloat, seen from its front-left corner](docs/images/sportsboat-afloat.png) | ![The sports boat with its headlights on, lighting the water ahead](docs/images/sportsboat-headlights.png) | ![The sports boat seen from its rear-left corner, showing the stern deck and the swim platform](docs/images/sportsboat-rear.png) | ![The sports boat seen from straight above, bow to the right](docs/images/sportsboat-top.png) |

A vehicle add-on for Minecraft Bedrock Edition. It is built as a Behavior Pack + Resource Pack driven by the stable Script API (`@minecraft/server` 2.x), with no experimental toggles required. The target setup is a Bedrock Dedicated Server on a home LAN, with players joining from PC (keyboard) and mobile (touch).

This add-on holds only rides. House-building parts will ship as a separate add-on with their own namespace. The `yasu_ride` namespace never changes once Yasuflatland Ride is first released ([ADR 0047](docs/adr/0047-rename-to-yasuflatland-ride.md)).

## Vehicles

| Vehicle | What it does | Details |
|---|---|---|
| **SUV** | Drives on land, flies, and dives as a submarine. Every player gets one on their first join | [Controls and details](docs/vehicles/suv.md) |
| **Sports boat** | Drives on water; shores stop it | [Controls and details](docs/vehicles/sportsboat.md) |

Both seat 4, can be repainted with any of the 16 dyes, and light the way with a headlight switch item. Each can be placed from its item and broken back into it. Each player keeps at most 10 SUVs and 1 sports boat: placing one more removes that player's oldest of that kind.

## Installing

Download `yasuflatland-ride-<version>.mcaddon` from the [latest release](https://github.com/yasuflatland-lf/yasuflatland-ride-minecraft/releases/latest) and open it on your device; on iPad, follow [these steps](docs/installing-on-ipad.md). Turn on **Yasuflatland Ride** under a world's Behavior Packs; no experiments are needed. Players who join a server that already has the packs do not need to install anything: the server sends the Resource Pack when they join, so accept the download prompt.

Upgrading from MyCar 0.5.0 or earlier? Read [the upgrade notes](docs/upgrading.md) first.

## Design

Design decisions are recorded as ADRs in [`docs/adr`](docs/adr/README.md). Highlights:

- Movement is script-driven: the script sets the vehicle's velocity every tick ([0002](docs/adr/0002-script-driven-vehicle-movement.md))
- Touch joystick input is scaled so pushing it halfway forward gives full throttle, matching keyboard players, and a stick held sideways turns the vehicle slowly forward instead of reversing ([0018](docs/adr/0018-sideways-stick-creeps-forward.md))
- Code is split into domain, application, and infrastructure layers so the driving logic does not depend on `@minecraft/server` ([0012](docs/adr/0012-ddd-layered-architecture.md))

## Development

Node and pnpm versions are pinned in `mise.toml`. Install [mise](https://mise.jdx.dev/), then run:

```sh
mise install
pnpm install
pnpm lint            # format and lint check with Biome
pnpm test            # unit tests, property-based tests, and the layer dependency check
pnpm build           # bundle the TypeScript into the Behavior Pack
pnpm package         # zip the packs into dist/yasuflatland-ride-<version>.mcaddon (run after build)
pnpm model           # generate the SUV and sports boat models and textures, the README previews, and pack icons
pnpm model:check     # fail if the README previews or pack icons are out of date with the model
pnpm server:up       # start the dev BDS in Docker
pnpm server:restart  # restart it under a new dev-only Resource Pack version
pnpm test:game       # in-game tests
```

CI runs the Biome check, the README preview and pack icon check, type checking, tests, the build, and packaging on every pull request.

The dev world starts fresh as `yasuflatland-ride-dev`. The world from before the rename can be deleted by hand; its path is recorded in [ADR 0047](docs/adr/0047-rename-to-yasuflatland-ride.md). Before your first `pnpm server:up` after the rename, remove the dev container from before the rename once, since it still holds the server ports: find its name with `docker ps -a`, then run `docker rm -f <name>`.

After the stack merges, the owner will rename the GitHub repository to `yasuflatland-ride-minecraft` and check the Codecov badge. The links above use that destination.

The manual test checklist is in [`docs/manual-test.md`](docs/manual-test.md), and releasing is described in [`docs/releasing.md`](docs/releasing.md).

## License

[MIT](LICENSE)
