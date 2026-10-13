# 0065. Check the import rules with dependency-cruiser

- Status: Accepted
- Date: 2026-10-13
- Extends: 0012, 0046, 0055

## Context

The layer, feature, and kind import rules lived in a hand-written regex over import statements in `tests/architecture.test.ts`. It extracted specifiers without compiler-style resolution, so folder imports and normalized paths needed custom handling. Replacing the checker should preserve the rules while resolving imports and naming violations.

We compared dependency-cruiser, ArchUnitTS, ts-arch, eslint-plugin-boundaries, Biome `noRestrictedImports`, and Nx/Sheriff. dependency-cruiser resolves imports, names each violated rule, and can draw the graph. eslint-plugin-boundaries would require ESLint alongside Biome. Biome `noRestrictedImports` cannot express that a kind may not import another kind because it has no reference to the importer's path. Nx/Sheriff target monorepos; this add-on has one source tree. ArchUnitTS and ts-arch offer architecture assertions, but dependency-cruiser's declarative rules cover the existing boundaries and serve both the CI gate and graph output.

## Decision

Use dependency-cruiser 18.5.0 with the existing import rules in `.dependency-cruiser.cjs`, run by `pnpm lint:deps` in CI. Count type-only imports with `tsPreCompilationDeps: true` and exclude `src/test-pack/`, which sits outside the layers. Add an unresolved-import rule so missing targets cannot evade the boundary checks.

Use the `swc` parser through `@swc/core` 1.16.13. dependency-cruiser supports the JavaScript API of `typescript` below 7, while this repository uses TypeScript 7.0.2, the Go port without that API. Without swc, the checker silently skips TypeScript files. The `missing-typescript-transpiler` warning is expected and does not change the exit code; keep TypeScript 7.

`tests/architecture.test.ts` keeps the folder layout tests and a fixture self-test of every rule. The fixtures cruise a temporary directory with the configuration's options and `forbidden` rules, minus its `tsConfig`, which points at the repository's tsconfig. They pass `validate: true` because without it dependency-cruiser runs no rules on any platform, and they resolve the directory with `realpathSync` because on macOS the temporary directory sits behind the `/var` to `/private/var` symlink, which would leave module paths outside `^src/`.

## Consequences

Violations name their rule and path. The graph can be drawn with `pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type dot`.

The rules still check imports only. A kind-specific value or name in shared code, as fixed in parts 1/4 and 3/4 of the Kind boundaries series, passes these checks; reviews still have to catch that.

The parser adds a native development dependency and an expected warning. Revisit when dependency-cruiser supports TypeScript 7: drop `@swc/core` and the parser option.
