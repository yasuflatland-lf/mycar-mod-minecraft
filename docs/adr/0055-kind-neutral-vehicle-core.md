# 0055. Kind-neutral vehicle core

- Status: Proposed
- Date: 2026-10-12

## Context

0050 split the vehicle into a shared core and a `Drive` per kind, and the sports boat (0051) became the second kind. The core was cut from the SUV by removing what the boat does not use, so SUV assumptions remain in it. Ground, air, water, and rail vehicles are planned. A review of `main` at a83dde0 found these assumptions:

1. `Drive` exposes `form`, `wheelsDown`, and `bankAngle`, so the boat reports `form = "car"` and `wheelsDown = true`. `DriveVehicles` picks the camera and water breathing from `vehicle.form`, and `DriveWorld` has `setForm`, `setBank`, and `setGearDown`
2. `Vehicle.create` and `Vehicle.rebuild` default to `kind = "suv"`, and `updateSpeed`, `steerYaw`, `stepMotion`, `stepFlightMotion`, `selectHits`, and `headlightCells` default to SUV values (`stepFlightMotion` also to the SUV's air). A missing argument compiles and runs as an SUV
3. `MotionState` mixes the state of the shared motion functions (`friction`, `expected`, `airExpected`, `stepTicks`), which both kinds use, with the boat's `waterDrag`. The next kind with its own state would add another field
4. `src/domain/vehicle` is flat, so nothing shows which files are SUV-only, and `boatDrive.ts` imports the SUV's `Form`. Types form a cycle: `vehicle.ts` → `drive.ts` → `suvDrive.ts` → `vehicle.ts`
5. `MotionLimits` in the shared profile has tyre values (`grip`, `handbrakeGrip`, `creepSpeed`); the boat sets `handbrakeGrip` equal to `grip`
6. `waterDepthFrom` caps the depth at `SPEC.carHeight`
7. The core turns the vehicle to the driver's yaw on mounting, which assumes a free heading
8. `SeatVacated` and `SeatLayout` carry SUV door bones
9. Each kind adds fields to `TickContext` and `VehicleSnapshot` (`waterDepth`, `waterBelow`, `velocityY`), and they are computed for every vehicle every tick
10. `PlacementRule` is a set of flags, `{ onWater, anyFace }`. `anyFace` only matters with `onWater`
11. `canPlaceAt` checks a fixed 3 × 2 × 3 box. It fits both collision boxes today (SUV 1.8 × 1.6, boat 2.2 × 1.2), but not a vehicle wider than 3 blocks

Three ways to carry per-kind visual state were compared: a typed state per kind written by a per-kind infrastructure adapter, a bag of property values, and a use case per kind. The adapter needs infrastructure code for every new kind, tested with a mocked `@minecraft/server`. The bag cannot express the gravity event the SUV fires with its form. A use case per kind copies the tick flow. Engine commands returned from the domain need no infrastructure code per kind, and pure unit tests can check them without mocks.

## Decision

### Layout and dependencies

- Keep the core in `src/domain/vehicle`: the aggregate, seats, ram, hit counter, headlight switch and beams, placement, fleet, paint, input, and the contracts in `drive.ts`
- Put the movement building blocks that kinds pick from in `src/domain/vehicle/motion/`: `stepMotion`, `stepFlightMotion`, step detection, water depth, `alignOnMount`, and their constants
- Put each kind in `src/domain/vehicle/kinds/<kind>/`: its drive, state, tuning, entity contract, and commands. The SUV's form, step, flight, submarine, and door values move from `SPEC` there
- Each tuning value still lives in one place (0002): `SPEC` for values the core reads, `motion/constants.ts` for the motion functions, and `kinds/<kind>/spec.ts` for one kind
- `kinds/index.ts` maps each kind to its profile, entity contract, and drive factory as a `Record<VehicleKind, …>`, and exports `createVehicle` and `rebuildVehicle`. `kind.ts` holds only the kind names and imports nothing
- `tests/architecture.test.ts` enforces, for `src/domain`, `src/application`, and `src/infrastructure`:
  - `kinds/<a>/` never imports `kinds/<b>/`
  - the core and `motion/` never import `kinds/`
  - the core never imports `motion/`
  - the application and infrastructure layers import only `kinds/index.ts` from `kinds/`
- `src/test-pack/` stays outside these rules, as it stays outside the layers
- The application and infrastructure layers get no per-kind folders. The kind-to-entity and kind-to-item tables in `identifiers.ts` stay

### Contracts

- `Vehicle` takes `(id, profile, drive)` with no defaults. It keeps seats and driver, ram, the hit counter, and the headlight switch
- `Drive` exposes `speed` and `yaw`, `onDriverMounted(driverYaw)`, `onSeatVacated(seat)`, which returns commands, and `step(raw, ctx)`, which returns `{ impulse, forward, commands, riders: { thirdPerson, underwater } }`. The drive owns its motion state and limits. The state of the shared motion functions stays a type in `motion/`; state only one kind uses, such as the boat's water drag estimate, lives in that kind's drive
- `Vehicle.tick` takes the riders, the test input, and the sensors. `Drive.step` gets only the sensors: `TickContext` is `{ tick, location, velocity: Vec3, onGround, solidAt(offset), waterAt(offset), targets() }`, and the three queries are lazy
- `VehicleProfile` keeps only what the core reads: seat positions, ram body, beams, and placement
- `VehicleSnapshot` drops `form`, `waterDepth`, `waterBelow`, and `velocityY`, gains `velocity: Vec3`, and reads the restored properties lazily, only when the aggregate is rebuilt

### Engine commands

- Commands are `setProperty`, `triggerEvent`, `playAnimation`, and `playSound` (at the vehicle). The vocabulary grows only when a kind needs an engine operation these four cannot express
- Properties, events, and animations use names local to the entity (`form`, `gravity_off`, `door_fr`). The infrastructure turns them into `yasu_ride:form` and `animation.yasu_ride.<entity>.<name>`, and exports those functions to the test pack. Sounds use full names, since vanilla sounds have no namespace
- Each kind declares an entity contract: properties with their type, enum values, or range; events; animations; and the properties restored after `/reload`. Commands are built by typed functions bound to the contract's keys
- `DriveVehicles` runs the step's commands first, in order, and the seat commands last, as `setForm`, `setBank`, `setGearDown`, and `playDoor` run today. A throw skips the rest of that vehicle's tick, so a failed gravity event never writes the form (0021). A missing entity makes a command do nothing
- Kinds cannot declare names the core writes: `headlights` and the paint events

### Placement

- `PlacementRule` becomes `{ surfaces, clearance }`, where `surfaces` lists `"top"` or `"water"` in the order tried. The SUV has `["top"]` and the boat has `["water", "top"]`. Both have `clearance` `{ halfX: 1, halfZ: 1, height: 2 }`

### Verification

- Behavior must not change. Existing unit and in-game tests may move or change how they drive the code, but not their scenarios or expected results, and no check is dropped
- A trace test records, per tick, the impulse, yaw, hits, driver, engine writes, and rider state of fixed-seed scenarios: SUV driving, walls, steps, takeoff, hover, landing, diving, surfacing, mounting, doors, rebuilding in flight, and ramming, plus the boat afloat, beached, and rebuilt. It runs at the domain level and through `DriveVehicles` with a fake world that throws at the gravity event. Numbers compare exactly. Only the code that normalizes old and new output into one form may change between pull requests; a pull request that changes the trace file is not a refactoring
- Stryker reports how many `src/domain/vehicle` mutants the trace test kills before the refactoring starts
- One pack test walks every kind in `kinds/index.ts` and checks that its declared properties, events, and animations exist in the packs with the declared types. It replaces the name and type checks in `behaviorPack.test.ts` and `references.test.ts`; their `client_sync` and event body checks stay as SUV pack tests
- A property-based test per kind checks that every command its drive emits uses a declared name and a value within the declared range

### Order

Each pull request keeps behavior and the trace file unchanged:

1. Trace test
2. `createVehicle` and `rebuildVehicle`, and no SUV defaults (2)
3. Sensors (6, 9)
4. Drive-owned motion, `onDriverMounted`, and the smaller profile (3, 5, 7)
5. Engine commands, entity contracts, restoring, and the pack tests (1, 8)
6. Placement (10, 11)
7. Folders, the registry, the `SPEC` split, and the dependency rules (4). The rules come last because they fail until the kinds are decoupled

## Consequences

A new kind needs its folder under `kinds/`, a row in `kinds/index.ts`, rows in the identifier tables, and its pack files. Shared code changes only when a kind needs a new command, sensor query, or placement surface, and each of those is added to the shared vocabulary for every kind.

The domain knows engine names (properties, events, animations), as it already knows bone names (0009), but it does not import `@minecraft/server` (0012). The compiler cannot catch a name or value that the packs do not define; the pack test and the property-based tests catch it in CI.

The trace test pins exact behavior, which 0010 avoids for lasting tests, so it is deleted after step 7.

When 0055 is accepted, 0050's flat layout and its rule that `SPEC` holds SUV-only tuning are superseded, and 0046 is extended. Step 7 also updates the architecture rules in AGENTS.md. Revisit the command vocabulary if it grows past eight operations, or if the add-on is ported away from Bedrock.
