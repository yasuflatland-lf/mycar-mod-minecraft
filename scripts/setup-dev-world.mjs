// Register the three packs in the dev world. The Resource Pack and the Behavior
// Pack's dependency on it get a fresh dev-only version on every run (ADR 0062),
// so the world lists the same versions that server/compose.yaml serves.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { writeDevManifests } from "./dev-pack-version.mjs";

const { version, resourcePack, behaviorPack } = writeDevManifests({
  packsDir: "packs",
  dataDir: "server/data",
});
const bp = behaviorPack.header;
const rp = resourcePack.header;
const testBp = JSON.parse(
  readFileSync("packs/yasu_ride_test_bp/manifest.json", "utf8"),
).header;
const dir = "server/data/worlds/yasuflatland-ride-dev";
mkdirSync(dir, { recursive: true });
writeFileSync(
  `${dir}/world_behavior_packs.json`,
  JSON.stringify([
    { pack_id: bp.uuid, version: bp.version },
    { pack_id: testBp.uuid, version: testBp.version },
  ]),
);
writeFileSync(
  `${dir}/world_resource_packs.json`,
  JSON.stringify([{ pack_id: rp.uuid, version: rp.version }]),
);
console.log(
  `registered packs in ${dir}; serving the Resource Pack as ${version.join(".")}`,
);
