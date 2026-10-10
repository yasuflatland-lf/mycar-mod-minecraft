# Architecture Decision Records

This directory records design decisions and the reasons behind them. The format follows Michael Nygard's ADRs (Context, Decision, Consequences). To reverse a decision, do not rewrite the original ADR: add a new ADR and set the original's status to "Superseded by NNNN".

| No. | Decision | Status |
|---|---|---|
| [0001](0001-bedrock-addon-with-stable-script-api.md) | Build a Bedrock add-on and use only the stable Script API | Accepted |
| [0002](0002-script-driven-vehicle-movement.md) | Drive vehicles by setting their velocity from the script | Accepted |
| [0003](0003-friction-compensation-and-axis-wall-detection.md) | Estimate and compensate for ground friction, and detect wall collisions per axis | Accepted |
| [0004](0004-two-block-step-up-by-look-ahead.md) | Climb two-block steps by looking ahead in the script | Accepted |
| [0005](0005-touch-throttle-compensation.md) | Compensate the throttle from the mobile joystick | Accepted |
| [0006](0006-ram-damage-and-occupant-protection.md) | Ram damage detection, and always protecting occupants | Accepted |
| [0007](0007-seats-and-driver.md) | Seats and choosing the driver | Accepted |
| [0008](0008-vehicle-item-and-breaking.md) | Placing and picking up vehicles | Accepted |
| [0009](0009-vehicle-model-conventions.md) | Vehicle model conventions, and accepting a square collision box | Accepted |
| [0010](0010-testing-strategy.md) | Testing strategy | Accepted |
| [0011](0011-dev-server-docker-raknet.md) | Run the development server as BDS in Docker with raknet | Accepted |
| [0012](0012-ddd-layered-architecture.md) | Split the code into domain, application, and infrastructure layers | Accepted |

The measurements and in-game tests behind these decisions are in [the driving-core spike findings](../spike-driving-core.md).

## Writing a new ADR

1. Copy the structure of an existing ADR into `NNNN-short-kebab-title.md`, using the next free number
2. Fill in `Status` (`Proposed` or `Accepted`) and `Date` (YYYY-MM-DD), then the three sections:
   - **Context**: the forces at play and what was tried, including measured numbers
   - **Decision**: what we will do, as concrete rules with their values
   - **Consequences**: what follows, including the downsides we accept and the conditions under which to revisit the decision
3. Add a row to the table above
4. Write in English. Refer to other ADRs by their four-digit number, for example "(0006)"
