// Bundle the built Behavior Pack and Resource Pack into dist/yasuflatland-addon-<version>.mcaddon.
// yasuflatland_test_bp is left out: it runs in-game tests and belongs in the dev world only.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const readManifest = (pack) =>
  JSON.parse(readFileSync(`packs/${pack}/manifest.json`, "utf8"));
const bp = readManifest("yasuflatland_bp");
const rp = readManifest("yasuflatland_rp");
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!existsSync("packs/yasuflatland_bp/scripts/main.js")) {
  fail(
    "packs/yasuflatland_bp/scripts/main.js is missing; run `pnpm build` first",
  );
}

// Bedrock refuses to load the Behavior Pack when the Resource Pack version it
// depends on is not installed, so a forgotten bump here breaks every device.
const rpDependency = bp.dependencies.find(
  (dependency) => dependency.uuid === rp.header.uuid,
);
if (!rpDependency) {
  fail("yasuflatland_bp/manifest.json has no dependency on yasuflatland_rp");
}
if (rpDependency.version.join(".") !== rp.header.version.join(".")) {
  fail(
    `yasuflatland_bp depends on yasuflatland_rp ${rpDependency.version.join(".")}, but yasuflatland_rp is ${rp.header.version.join(".")}`,
  );
}

const version = bp.header.version.join(".");
const expected = process.env.EXPECTED_VERSION?.replace(/^v/, "");
if (expected && expected !== version) {
  fail(
    `expected version ${expected}, but yasuflatland_bp/manifest.json says ${version}`,
  );
}

mkdirSync("dist", { recursive: true });
const out = resolve(`dist/yasuflatland-addon-${version}.mcaddon`);
rmSync(out, { force: true });
execFileSync(
  "zip",
  [
    "-r",
    "-X",
    "-q",
    out,
    "yasuflatland_bp",
    "yasuflatland_rp",
    "-x",
    "*.DS_Store",
  ],
  {
    cwd: "packs",
    stdio: "inherit",
  },
);
console.log(`packaged ${out}`);
