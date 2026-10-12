// Bundle the built Behavior Pack and Resource Pack into dist/yasuflatland-ride-<version>.mcaddon.
// yasu_ride_test_bp is left out: it runs in-game tests and belongs in the dev world only.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const BP = "yasu_ride_bp";
const RP = "yasu_ride_rp";
const readManifest = (pack) =>
  JSON.parse(readFileSync(`packs/${pack}/manifest.json`, "utf8"));
const bp = readManifest(BP);
const rp = readManifest(RP);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!existsSync(`packs/${BP}/scripts/main.js`)) {
  fail(`packs/${BP}/scripts/main.js is missing; run \`pnpm build\` first`);
}

// Bedrock refuses to load the Behavior Pack when the Resource Pack version it
// depends on is not installed, so a forgotten bump here breaks every device.
const rpDependency = bp.dependencies.find(
  (dependency) => dependency.uuid === rp.header.uuid,
);
if (!rpDependency) {
  fail(`${BP}/manifest.json has no dependency on ${RP}`);
}
if (rpDependency.version.join(".") !== rp.header.version.join(".")) {
  fail(
    `${BP} depends on ${RP} ${rpDependency.version.join(".")}, but ${RP} is ${rp.header.version.join(".")}`,
  );
}

// The Resource Pack depends back on the Behavior Pack version, so a
// release that bumps the Behavior Pack must update this side too.
const bpDependency = rp.dependencies?.find(
  (dependency) => dependency.uuid === bp.header.uuid,
);
if (!bpDependency) {
  fail(`${RP}/manifest.json has no dependency on ${BP}`);
}
if (bpDependency.version.join(".") !== bp.header.version.join(".")) {
  fail(
    `${RP} depends on ${BP} ${bpDependency.version.join(".")}, but ${BP} is ${bp.header.version.join(".")}`,
  );
}

const version = bp.header.version.join(".");
const expected = process.env.EXPECTED_VERSION?.replace(/^v/, "");
if (expected && expected !== version) {
  fail(`expected version ${expected}, but ${BP}/manifest.json says ${version}`);
}

mkdirSync("dist", { recursive: true });
const out = resolve(`dist/yasuflatland-ride-${version}.mcaddon`);
rmSync(out, { force: true });
execFileSync("zip", ["-r", "-X", "-q", out, BP, RP, "-x", "*.DS_Store"], {
  cwd: "packs",
  stdio: "inherit",
});
console.log(`packaged ${out}`);
