# 0001. Build a Bedrock add-on and use only the stable Script API

- Status: Accepted
- Date: 2026-10-10

## Context

We want gameplay close to MrCrayfish's Vehicle Mod on Minecraft Bedrock Edition. Bedrock has nothing like Forge or Fabric on Java Edition for extending the game itself; what we can build is an add-on (a Behavior Pack and a Resource Pack). Movement is controlled with JSON entity definitions and the Script API (`@minecraft/server`).

The Script API comes in a stable and a beta flavor. Beta requires turning on experimental features in the world and can change incompatibly with game updates. The play environment is a Bedrock Dedicated Server (BDS) on a home LAN, joined from PC and mobile.

## Decision

- Build an add-on made of a Behavior Pack, a Resource Pack, and the Script API
- Use only the stable `@minecraft/server` 2.x. Do not use beta APIs or experimental features
- Write scripts in TypeScript, bundle them into a single file with esbuild, and ship it in the Behavior Pack

## Consequences

- Game updates are less likely to break the add-on. The input API we need (`InputInfo.getMovementVector()`) became stable in v1.21.70, so we do not depend on beta
- If we ever need an API that exists only in beta, revisit this ADR
- Scripts run only on the server. There is no way to predict vehicle movement on the client (this is the root of the constraint in 0002)
