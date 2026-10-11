# 0048. Mutation testing with Stryker, and unused code checks with knip

- Status: Accepted
- Date: 2026-10-12

## Context

Line coverage (0010) shows which code the unit tests run, not whether they would notice that code changing. Property-based tests assert broad properties, so a wrong constant or a flipped comparison can still pass them. Unused files, exports, and dependencies also pile up as forms and features are added (0039), and nothing flags them.

StrykerJS mutates the source and reruns the tests to see which changes survive. Its TypeScript checker drops mutants that do not type-check, so they are not counted as survivors. Both the checker and Stryker's core (which rewrites `tsconfig.json` in its sandbox) load the TypeScript compiler API, but TypeScript 7 is the native compiler and its npm package has no JavaScript API. Stryker tracks TypeScript 7 support in [stryker-js#6110](https://github.com/stryker-mutator/stryker-js/issues/6110), with no plan yet.

The vitest runner 10.0.0 was built against Vitest 4. Under Vitest 5 its per-test filter matches no test, so every covered mutant survives and the run still exits 0 ([stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210); fixes proposed in [#6214](https://github.com/stryker-mutator/stryker-js/pull/6214) and [#6220](https://github.com/stryker-mutator/stryker-js/pull/6220), not released).

## Decision

- Run StrykerJS with the vitest runner and the TypeScript checker through `pnpm test:mutation`, configured in `stryker.config.mjs`. Mutate everything in `src/` except `src/main.ts` and `src/test-pack/runner.ts`, which only wire up `@minecraft/server`. The HTML report goes to `reports/mutation/`
- List the Stryker plugins explicitly in `plugins`, because pnpm keeps them out of core's own `node_modules`, where the default glob looks
- Give `@stryker-mutator/core` and `@stryker-mutator/typescript-checker` TypeScript 6.0.3 through a `readPackage` hook in `.pnpmfile.cjs`, which drops their `typescript` peer and adds it as a dependency. The project itself stays on TypeScript 7
- Patch `@stryker-mutator/vitest-runner` 10.0.0 (`patches/`) to join suite and test names with ` > `, trimming each part, as #6214 does. Stryker runs each mutant only against the tests that cover it, selected through Vitest's `testNamePattern`, and Vitest 5 matches that pattern against the names joined with ` > `. Unpatched, the runner joins them with spaces, no test matches, and every mutant survives
- Do not run mutation testing in CI. Run it by hand when changing tests or domain logic
- Fail the run below a 60% score (`thresholds.break`). The first run scored 69%, so a far lower score more likely means the runner patch stopped working than that the tests got worse
- Keep Renovate from merging `@stryker-mutator/*` updates automatically, so a person moves or drops the patch and the TypeScript 6 pin with each update
- Run knip through `pnpm lint:unused`, configured in `knip.json`, with `src/main.ts` and `src/test-pack/runner.ts` as entries (the esbuild script names them, which knip cannot read). Run it in CI after the other lint checks

## Consequences

- The checker type-checks mutants with TypeScript 6, so it can disagree with `pnpm typecheck` on TypeScript 7 behavior. Renovate does not update the 6.0.3 pin in `.pnpmfile.cjs`; bump it by hand
- Drop the hook once #6110 is resolved and Stryker can use TypeScript 7
- A Renovate update of the vitest runner fails `pnpm install` until the patch is moved to the new version or dropped. Drop it once a fix for #6210 is released. A score below the break threshold with "0.00 tests per mutant" means the patch no longer matches Vitest's naming
- knip fails CI on a new unused file, export, or dependency, so remove it or add it to `knip.json` with a reason
- The first run (2026-10-12) took about 1.5 minutes for 1,830 mutants. The checker dropped 598 of them, 248 had no unit test coverage (mostly `src/infrastructure/bedrock`), and the score was 69% overall and 86% of the covered mutants (domain 87%, application 92%)
- Per-test coverage is not fully deterministic: two runs of the same commit differed by two survivors, so compare scores loosely
- Raise the break threshold as the surviving mutants are fixed. Revisit running mutation testing in CI once the runner fixes are released and the workarounds are gone
