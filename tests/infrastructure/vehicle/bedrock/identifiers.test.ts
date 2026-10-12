import { describe, expect, it } from "vitest";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import { PAINTS } from "../../../../src/domain/vehicle/paint";
import { NAMESPACE } from "../../../../src/infrastructure/shared/identifiers";
import {
  ENTITY_TYPE,
  entityEventId,
  entityPropertyId,
  FLEET_PROPERTY,
  HEADLIGHT_SWITCH_TYPE,
  HEADLIGHTS_PROPERTY,
  ITEM_TYPE,
  kindOfEntity,
  kindOfItem,
  LIT_CELLS_PROPERTY,
  paintEvent,
  STARTER_RECEIVED_PROPERTY,
  TEST_INPUT_EVENT,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

describe("identifiers (ADR 0047)", () => {
  it.each(VEHICLE_KINDS)(
    "round-trips the entity and item IDs of %s",
    (kind) => {
      expect(kindOfEntity(ENTITY_TYPE[kind])).toBe(kind);
      expect(kindOfItem(ITEM_TYPE[kind])).toBe(kind);
    },
  );

  it.each([undefined, "minecraft:cow", "yasu_ride:unknown", "toString"])(
    "does not recognize an unrelated type %s",
    (typeId) => {
      expect(kindOfEntity(typeId)).toBeUndefined();
      expect(kindOfItem(typeId)).toBeUndefined();
    },
  );

  it("does not confuse entity and item IDs", () => {
    for (const kind of VEHICLE_KINDS) {
      expect(kindOfEntity(ITEM_TYPE[kind])).toBeUndefined();
      expect(kindOfItem(ENTITY_TYPE[kind])).toBeUndefined();
    }
  });

  it("gives every listed add-on identifier its own snake_case name in the add-on namespace", () => {
    expect(NAMESPACE).toMatch(/^[a-z][a-z0-9_]*$/);
    const ids = [
      ...Object.values(ENTITY_TYPE),
      ...Object.values(ITEM_TYPE),
      STARTER_RECEIVED_PROPERTY,
      FLEET_PROPERTY,
      HEADLIGHT_SWITCH_TYPE,
      HEADLIGHTS_PROPERTY,
      LIT_CELLS_PROPERTY,
      TEST_INPUT_EVENT,
      ...["form", "bank", "gear_down"].map(entityPropertyId),
      ...["gravity_on", "gravity_off"].map(entityEventId),
      ...PAINTS.map(paintEvent),
    ];
    for (const id of ids) {
      expect(id).toMatch(new RegExp(`^${NAMESPACE}:[a-z][a-z0-9_]*$`));
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
