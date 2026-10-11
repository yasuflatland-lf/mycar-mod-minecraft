import { describe, expect, it } from "vitest";
import { PAINTS } from "../../../../src/domain/vehicle/paint";
import {
  BANK_PROPERTY,
  FLEET_PROPERTY,
  FORM_PROPERTY,
  GEAR_DOWN_PROPERTY,
  GRAVITY_OFF_EVENT,
  GRAVITY_ON_EVENT,
  HEADLIGHT_SWITCH_TYPE,
  HEADLIGHTS_PROPERTY,
  ITEM_TYPE,
  LIT_CELLS_PROPERTY,
  paintEvent,
  STARTER_RECEIVED_PROPERTY,
  TEST_INPUT_EVENT,
  VEHICLE_TYPE,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

describe("identifiers (ADR 0047)", () => {
  it("gives every add-on identifier its own snake_case name in the yasuflatland namespace", () => {
    const ids = [
      VEHICLE_TYPE,
      ITEM_TYPE,
      STARTER_RECEIVED_PROPERTY,
      FLEET_PROPERTY,
      HEADLIGHT_SWITCH_TYPE,
      HEADLIGHTS_PROPERTY,
      LIT_CELLS_PROPERTY,
      TEST_INPUT_EVENT,
      FORM_PROPERTY,
      BANK_PROPERTY,
      GEAR_DOWN_PROPERTY,
      GRAVITY_OFF_EVENT,
      GRAVITY_ON_EVENT,
      ...PAINTS.map(paintEvent),
    ];
    for (const id of ids) {
      expect(id).toMatch(/^yasuflatland:[a-z][a-z0-9_]*$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
