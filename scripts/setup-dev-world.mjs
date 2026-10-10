// scripts/setup-dev-world.mjs: register the three packs in the dev world, reading each version from its manifest
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(p, "utf8")).header;
const bp = read("packs/mycar_bp/manifest.json");
const testBp = read("packs/mycar_test_bp/manifest.json");
const rp = read("packs/mycar_rp/manifest.json");
const dir = "server/data/worlds/mycar-dev";
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
