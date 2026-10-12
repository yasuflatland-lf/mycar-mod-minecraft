import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  CORE_EVENT_PREFIXES,
  CORE_PROPERTY_NAMES,
} from "../../src/domain/vehicle/entityContract";
import { VEHICLE_KINDS } from "../../src/domain/vehicle/kind";
import { entityContractOf } from "../../src/domain/vehicle/kinds/index";
import {
  ENTITY_TYPE,
  entityAnimationId,
  entityEventId,
  entityPropertyId,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";
import { jsonFiles } from "../support/packFiles";

const animations = new Set(
  jsonFiles("packs/yasu_ride_rp/animations").flatMap((file) =>
    Object.keys(file.animations ?? {}),
  ),
);

function expectNotReserved(name: string): void {
  expect(CORE_PROPERTY_NAMES).not.toContain(name);
  expect(CORE_EVENT_PREFIXES.some((prefix) => name.startsWith(prefix))).toBe(
    false,
  );
}

it.each(VEHICLE_KINDS)(
  "matches the %s entity contract to its packs and reserves core names",
  (kind) => {
    const contract = entityContractOf(kind);
    const entity = JSON.parse(
      readFileSync(
        `packs/yasu_ride_bp/entities/yasu_ride/${kind}.se.json`,
        "utf8",
      ),
    )["minecraft:entity"];
    for (const [name, spec] of Object.entries(contract.properties)) {
      const definition = entity.description.properties[entityPropertyId(name)];
      expect(definition).toMatchObject(spec);
      expect(Object.keys(definition).sort()).toEqual(
        [...Object.keys(spec), "default", "client_sync"].sort(),
      );
      expectNotReserved(name);
    }
    for (const name of contract.events) {
      expect(entity.events).toHaveProperty(entityEventId(name));
      expectNotReserved(name);
    }
    for (const name of contract.animations) {
      expect(animations).toContain(entityAnimationId(ENTITY_TYPE[kind], name));
      expectNotReserved(name);
    }
    for (const name of contract.restored)
      expect(contract.properties).toHaveProperty(name);
  },
);
