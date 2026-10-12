import { build } from "esbuild";

const common = {
  bundle: true,
  format: "esm",
  target: "es2022",
  external: ["@minecraft/server"],
  logLevel: "info",
};
await build({
  ...common,
  entryPoints: ["src/main.ts"],
  outfile: "packs/yasu_ride_bp/scripts/main.js",
});
await build({
  ...common,
  entryPoints: ["src/test-pack/runner.ts"],
  outfile: "packs/yasu_ride_test_bp/scripts/main.js",
});
