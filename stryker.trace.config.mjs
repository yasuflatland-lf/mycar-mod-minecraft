export default {
  packageManager: "pnpm",
  plugins: [
    "@stryker-mutator/typescript-checker",
    "@stryker-mutator/vitest-runner",
  ],
  testRunner: "vitest",
  vitest: { configFile: "vitest.trace.config.ts" },
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  mutate: [
    "src/domain/vehicle/**/*.ts",
    "src/application/vehicle/driveVehicles.ts",
  ],
  coverageAnalysis: "perTest",
  thresholds: { high: 80, low: 60, break: null },
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation-trace/index.html" },
};
