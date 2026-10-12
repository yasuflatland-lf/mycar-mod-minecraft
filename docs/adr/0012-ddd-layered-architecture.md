# 0012. Split the code into domain, application, and infrastructure layers

- Status: Accepted
- Date: 2026-10-10

## Context

The driving core's scripts mix processing of different kinds. There are rules that are decided without the game, such as the driving computation and step and collision detection. There are procedures, such as moving every vehicle every tick, placing a vehicle from an item, and breaking it when punched. And there is code that calls `@minecraft/server`. In the spike all of this lived in one file, and the rules could not be tested on their own.

DDD's layered architecture also has a four-layer variant with a separate presentation layer. This add-on's "screen" is the game itself, and both subscribing to events (`system.runInterval`, `world.afterEvents`) and implementing ports are calls into `@minecraft/server`. Splitting them would leave both depending on the same thing, so an extra layer brings no benefit.

## Decision

Split `src/` into the following three layers. Dependencies point one way only: infrastructure → application → domain.

| Layer | Location | Contents | May depend on |
|---|---|---|---|
| Domain | `src/domain/` | The `Vehicle` aggregate, value objects (`Vec2`, `DriveInput`, and so on), domain services (driving computation, step detection, collision detection, placement-space detection), domain events, repository interfaces, tuning values | Only the domain itself |
| Application | `src/application/` | Use cases (`DriveVehicles`, `PlaceVehicle`, `HitVehicle`) and the interfaces of the ports it requires from the game | Domain |
| Infrastructure | `src/infrastructure/` | Implementations of ports and repositories, event subscriptions, wiring (`bootstrap`) | Application, domain, `@minecraft/server` |

- Only the infrastructure layer may import `@minecraft/server`
- The entry point `src/main.ts` only calls `bootstrap()`
- The direction of dependencies is checked by a test (`tests/architecture.test.ts`) that inspects import statements
- The in-game test pack (`src/test-pack/`) is a testing tool that runs in a script environment separate from the main pack, so it sits outside these three layers

## Consequences

- The domain and application layers can be unit-tested and property-tested without the game (0010). Application tests replace ports with fake implementations
- Vehicle state (velocity, heading, seats, punch count) is held by the `Vehicle` aggregate and kept in an in-memory repository. It is not persisted (it is rebuilt when scripts reload)
- Handing data across layers adds code, so there are more files than in the spike

See [0046](0046-organize-each-layer-by-feature.md) for feature boundaries within each layer.
