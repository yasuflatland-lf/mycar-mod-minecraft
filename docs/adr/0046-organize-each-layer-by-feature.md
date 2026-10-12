# 0046. Organize each layer by feature

- Status: Extended by 0050, 0055
- Date: 2026-10-11

## Context

The add-on holds rides and will grow beyond the SUV to include boats. House-building parts will ship as a separate add-on with its own namespace, not as a feature of this one. The three layers (0012) separate domain rules, use cases, and game integration, but flat application and infrastructure folders do not separate kinds of content. Vehicle persistence, test input, and application ports all depend on the vehicle domain and belong to that feature.

A pnpm workspace per feature would provide package boundaries, but adds package manifests, build wiring, and dependency management for content shipped together in one add-on. Keeping the flat layout avoids moves today but leaves future content mixed together without enforced feature boundaries.

## Decision

- Keep the three layers and their dependency direction: infrastructure → application → domain (0012). Only infrastructure imports `@minecraft/server`; APIs remain stable.
- A feature is a kind of content. All driven entities belong to `vehicle`, including a future boat as a separate entity, not an SUV form. Keep `domain/vehicle` flat until another vehicle requires an internal split.
- Every TypeScript file in each layer lives under a feature folder or `shared/`, except `src/infrastructure/bootstrap.ts`. Do not create empty folders for future features.
- `shared/` holds code used by more than one feature. Today the shared modules are `domain/shared/vec.ts` and `infrastructure/shared/identifiers.ts`; the latter exports the namespace and an `id(name)` helper.
- A feature must not import another feature in any layer. Shared code must not import a feature. Collect feature names from all three layers and enforce these boundaries by resolving relative imports in the architecture test. Keep the existing layer checks, and add example tests for the resolver alongside the import parser tests (0010).
- Each feature exposes an infrastructure install function. `installVehicles()` constructs the repositories, world adapter, test input store, logger, and use cases, then registers subscriptions. `bootstrap()` calls the install functions and logs the existing loaded message.
- Tests mirror the feature layout. `src/main.ts`, the in-game test pack, pack tests (`tests/packs/`), and `tests/support/` remain in their existing locations.
- This reorganization changes no behavior, IDs, properties, events, pack files, or tuning values; the namespace and IDs are unchanged by this reorganization.

## Consequences

- New kinds of content get their own folders and one install call in the composition root, while all content still ships in one add-on.
- Relative imports become longer, and the architecture test must enforce both layer direction and feature isolation.
- Features cannot directly reuse another feature's internals. Code genuinely needed by multiple features moves to `shared/`.
- Revisit package boundaries if features need independent distribution or builds. Decide the internal layout of `vehicle/` when implementing another driven entity.
