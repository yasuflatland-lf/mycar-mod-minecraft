# Architecture Decision Records

This directory records design decisions and the reasons behind them. The format follows Michael Nygard's ADRs (Context, Decision, Consequences). To reverse a decision, do not rewrite the original ADR: add a new ADR and set the original's status to "Superseded by NNNN".

| No. | Decision | Status |
|---|---|---|
| [0001](0001-bedrock-addon-with-stable-script-api.md) | Build a Bedrock add-on and use only the stable Script API | Accepted |
| [0002](0002-script-driven-vehicle-movement.md) | Drive vehicles by setting their velocity from the script | Accepted |
| [0003](0003-friction-compensation-and-axis-wall-detection.md) | Estimate and compensate for ground friction, and detect wall collisions per axis | Accepted |
| [0004](0004-two-block-step-up-by-look-ahead.md) | Climb two-block steps by looking ahead in the script | Superseded in part by 0035 |
| [0005](0005-touch-throttle-compensation.md) | Compensate the throttle from the mobile joystick | Superseded by 0018 |
| [0006](0006-ram-damage-and-occupant-protection.md) | Ram damage detection, and always protecting occupants | Accepted |
| [0007](0007-seats-and-driver.md) | Seats and choosing the driver | Superseded by 0019 |
| [0008](0008-vehicle-item-and-breaking.md) | Placing and picking up vehicles | Superseded in part by 0036 |
| [0009](0009-vehicle-model-conventions.md) | Vehicle model conventions, and accepting a square collision box | Accepted |
| [0010](0010-testing-strategy.md) | Testing strategy | Accepted |
| [0011](0011-dev-server-docker-raknet.md) | Run the development server as BDS in Docker with raknet | Superseded by 0015 |
| [0012](0012-ddd-layered-architecture.md) | Split the code into domain, application, and infrastructure layers | Accepted |
| [0013](0013-dependency-updates-with-renovate.md) | Keep dependencies up to date with Renovate | Accepted |
| [0014](0014-opt-in-nethernet-dev-server.md) | Offer NetherNet on the dev server as an opt-in transport | Superseded by 0015 |
| [0015](0015-dev-server-docker-nethernet.md) | Run the development server as BDS in Docker with NetherNet | Accepted |
| [0016](0016-readme-preview-rendered-from-model.md) | Render the README preview from the model files | Superseded by 0027 |
| [0017](0017-repaint-vehicles-with-dye.md) | Repaint vehicles with dye | Superseded by 0031 |
| [0018](0018-sideways-stick-creeps-forward.md) | Treat a sideways stick as a slow forward turn | Accepted |
| [0019](0019-passengers-move-up-to-the-driver-seat.md) | Passengers move up to the driver seat | Accepted |
| [0020](0020-headlights.md) | Headlights that light up the road | Accepted |
| [0021](0021-flight-mode.md) | Flight mode: toggle with a double tap, climb with the view pitch, and switch gravity with a component group | Superseded in part by 0032, 0034, and 0039 |
| [0022](0022-fold-wheels-and-glow-in-flight.md) | Fold the wheels and light their undersides in flight | Superseded in part by 0033 |
| [0023](0023-starter-vehicle-on-first-join.md) | Give each player a vehicle item on their first join | Accepted |
| [0024](0024-item-use-on-mobile-and-longer-headlights.md) | Make the vehicle item and the headlight switch work on mobile, and light the road three times farther | Accepted |
| [0025](0025-jump-on-touch-and-a-sticky-driver.md) | Keep a touch rider's Jump from dismounting them, and keep the driver while they ride | Accepted |
| [0026](0026-bank-into-turns-in-flight.md) | Bank into turns in flight | Accepted |
| [0027](0027-readme-previews-in-three-poses.md) | Render the README previews in three poses | Accepted |
| [0028](0028-third-person-camera-in-flight.md) | Switch riders to the third-person camera in flight | Accepted |
| [0029](0029-raise-the-seats.md) | Raise the seats so riders' legs stay inside the body | Accepted |
| [0030](0030-engine-and-hover-sounds.md) | Engine and hover sounds from client animations, stepped by speed | Accepted |
| [0031](0031-repaint-with-all-sixteen-dyes.md) | Repaint vehicles with all sixteen dyes | Superseded in part by 0036 |
| [0032](0032-climb-with-jump-and-sink-with-the-stick.md) | Climb with held Jump and sink with the stick pulled back | Accepted |
| [0033](0033-lower-the-wheels-before-touchdown.md) | Lower the wheels before touchdown | Accepted |
| [0034](0034-touch-down-from-flight.md) | Return to the ground when a flying vehicle sinks onto it | Accepted |
| [0035](0035-jump-one-block-steps-in-the-script.md) | Jump one-block steps in the script, and skip blocks without a collision box | Accepted |
| [0036](0036-paint-by-hitting-with-a-dye.md) | Paint by hitting with a dye, and get in by interacting | Accepted |
| [0037](0037-one-dye-per-repaint-within-a-tick.md) | Use one dye per repaint within a tick | Accepted |
| [0039](0039-vehicle-forms.md) | Vehicle forms | Accepted |
| [0040](0040-submarine.md) | Submarine form | Accepted |
| [0041](0041-sonar-sound-under-water.md) | Sonar sound under water | Accepted |

The measurements and in-game tests behind these decisions are in [the driving-core spike findings](../spike-driving-core.md).

## Writing a new ADR

1. Copy the structure of an existing ADR into `NNNN-short-kebab-title.md`, using the next free number
2. Fill in `Status` (`Proposed` or `Accepted`) and `Date` (YYYY-MM-DD), then the three sections:
   - **Context**: the forces at play and what was tried, including measured numbers
   - **Decision**: what we will do, as concrete rules with their values
   - **Consequences**: what follows, including the downsides we accept and the conditions under which to revisit the decision
3. Add a row to the table above
4. Write in English. Refer to other ADRs by their four-digit number, for example "(0006)"
