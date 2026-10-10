# 0010. Testing strategy

- Status: Accepted
- Date: 2026-10-10

## Context

The spike built automated measurements for acceleration, steps, walls, and collisions, but they only logged values without judging pass or fail, and BDS had to be run by hand. Bugs such as running away along walls or exceeding the max speed were found only by driving in game.

## Decision

- Put pure computation (input conversion, driving computation, step detection, collision detection, choosing the driver) in modules that do not depend on the game API
- Keep example-based tests for these to a minimum and use property-based tests (fast-check, vitest). For the driving computation, stand in for the engine with a simple model ("on the ground, multiply velocity by a friction factor"; "a wall zeroes velocity on the axis it hits") and run random input sequences for hundreds of ticks
- Verify integration with the game through in-game tests written in a test-only Behavior Pack. Tests are started with `scriptevent`; they build a test track in the world, drive vehicles on it, and log each test's result and a final summary. A Node script sends commands to the BDS in Docker, reads the log, and reports pass or fail through its exit code
- Pass test input from the test pack to the main pack through the script event `mycar:test_input`. The message is `<vehicleId>,<moveX>,<moveY>,<jump>` (`jump` is `0` or `1`), or `<vehicleId>,clear` to remove the input. The main pack accepts the event only when its `sourceType` is `Server`, rejects values that are not finite, and clamps `moveX` and `moveY` to [-1, 1]. It keeps the latest input per vehicle in memory and drops entries for vehicles that are no longer loaded
- Do not use the GameTest framework (`@minecraft/server-gametest`). It exists only in beta (against 0001) and needs separate structure files (`.mcstructure`) for tests
- Verify that occupants take no damage (0006) manually, because only players can sit in seats and a test cannot provide occupants
- Verify feel (smoothness of the driver camera, visuals) manually on real PC and mobile devices. Rate camera smoothness on a five-point scale; 3 or above passes

## Consequences

- One property stands in for many examples, so fewer example tests are needed. When a property fails, it is shrunk to a minimal counterexample, which makes the cause easier to trace
- The engine model is a simplification of the real engine, so bugs can still appear in game even when property-based tests pass. In-game tests catch that gap
- Mobs spawned with `dimension.spawnEntity` are removed within one tick when they are far from players (confirmed in the spike). In-game tests spawn them with the `summon` command instead. `fill` is limited to 32,768 blocks per call, so clearing the test track is split into several calls
- Dynamic properties are stored per pack, so the main pack cannot read a value that the test pack writes (confirmed on BDS in both directions). This is why test input travels as a script event
- Entity tags and entity properties were also rejected. Tags persist in the world, so a test that fails halfway leaves an empty vehicle driving even after a restart, and the main pack cannot tell who added a tag. Entity properties would add test-only fields to the production entity definition, and a written value becomes visible only on the next tick
- The receiver for `mycar:test_input` stays in the production pack. Checking `sourceType` and validating the values limit what it accepts, but an operator could still drive an empty vehicle by running a script that sends the event
