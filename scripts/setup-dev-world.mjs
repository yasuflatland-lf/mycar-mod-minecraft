// Register the three packs in the dev world, reading each version from its manifest.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const readHeader = (path) => JSON.parse(readFileSync(path, "utf8")).header;
const bp = readHeader("packs/yasu_ride_bp/manifest.json");
const testBp = readHeader("packs/yasu_ride_test_bp/manifest.json");
const rp = readHeader("packs/yasu_ride_rp/manifest.json");
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
console.log(`registered packs in ${dir}`);
