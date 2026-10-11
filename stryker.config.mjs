export default {
  packageManager: "pnpm",
  // pnpm keeps the plugins out of core's own node_modules, where the default
  // "@stryker-mutator/*" glob looks for them.
  plugins: [
    "@stryker-mutator/typescript-checker",
    "@stryker-mutator/vitest-runner",
  ],
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  // main.ts and the test pack runner only wire up @minecraft/server, which
  // exists only inside the game, so no unit test can kill their mutants (0010).
  mutate: ["src/**/*.ts", "!src/main.ts", "!src/test-pack/runner.ts"],
  coverageAnalysis: "perTest",
  // The first run scored 69% (ADR 0048). A score far below that more likely
  // means the vitest runner patch stopped matching Vitest's test names and no
  // test ran for any mutant, which Stryker would otherwise report as success.
  thresholds: { high: 80, low: 60, break: 60 },
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
};
