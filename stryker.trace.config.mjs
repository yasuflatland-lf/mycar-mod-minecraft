import base from "./stryker.config.mjs";

export default {
  ...base,
  vitest: { configFile: "vitest.trace.config.ts" },
  mutate: [
    "src/domain/vehicle/**/*.ts",
    "src/application/vehicle/driveVehicles.ts",
  ],
  thresholds: { ...base.thresholds, break: null },
  htmlReporter: { fileName: "reports/mutation-trace/index.html" },
};
