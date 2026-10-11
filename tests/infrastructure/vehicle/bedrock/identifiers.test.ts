import { describe, expect, it } from "vitest";
import { PAINTS } from "../../../../src/domain/vehicle/paint";
import { NAMESPACE } from "../../../../src/infrastructure/shared/identifiers";
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
  it("gives every listed add-on identifier its own snake_case name in the add-on namespace", () => {
    expect(NAMESPACE).toMatch(/^[a-z][a-z0-9_]*$/);
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
      expect(id).toMatch(new RegExp(`^${NAMESPACE}:[a-z][a-z0-9_]*$`));
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
