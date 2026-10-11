import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORMS } from "../../src/domain/vehicle/form";
import { SEAT_POSITIONS } from "../../src/domain/vehicle/seats";
import { SPEC } from "../../src/domain/vehicle/spec";
import {
  BANK_PROPERTY,
  FORM_PROPERTY,
  GEAR_DOWN_PROPERTY,
  GRAVITY_OFF_EVENT,
  GRAVITY_ON_EVENT,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const entity = read("packs/yasuflatland_bp/entities/yasuflatland/suv.json")[
  "minecraft:entity"
];
const c = entity.components;
const recipe = read("packs/yasuflatland_bp/recipes/yasuflatland/suv_item.json")[
  "minecraft:recipe_shaped"
];

describe("packs/yasuflatland_bp", () => {
  it("has a collision box 1.8 wide and 1.6 high (ADR 0009)", () => {
    expect(c["minecraft:collision_box"]).toEqual({ width: 1.8, height: 1.6 });
  });

  it("seat positions and order match SEAT_POSITIONS, with the driver's seat at 0 (ADR 0019)", () => {
    const seats = c["minecraft:rideable"].seats;
    expect(c["minecraft:rideable"].controlling_seat).toBe(0);
    expect(
      seats.map((s: { position: number[] }) => [s.position[0], s.position[2]]),
    ).toEqual(SEAT_POSITIONS.map((p) => [p.x, p.z]));
    expect(seats[0].lock_rider_rotation).toBe(90);
  });

  it("the vehicle takes no damage (ADR 0006)", () => {
    expect(c["minecraft:damage_sensor"].triggers).toEqual({
      cause: "all",
      deals_damage: "no",
    });
  });

  it("takes Jump as a zero-strength power jump, so a touch rider's Jump does not dismount them (ADR 0025)", () => {
    expect(c["minecraft:input_ground_controlled"]).toEqual({});
    expect(c["minecraft:can_power_jump"]).toEqual({});
    expect(c["minecraft:horse.jump_strength"]).toEqual({ value: 0 });
    expect(c["minecraft:movement"]).toEqual({ value: 0.0 });
  });

  it("leaves one-block steps to the engine (ADR 0004)", () => {
    expect(c["minecraft:variable_max_auto_step"].base_value).toBe(1.0625);
  });

  it("has an item and a recipe (ADR 0008)", () => {
    expect(
      read("packs/yasuflatland_bp/items/yasuflatland/suv_item.json")[
        "minecraft:item"
      ].description.identifier,
    ).toBe("yasuflatland:suv_item");
    expect(recipe.result.item).toBe("yasuflatland:suv_item");
  });

  it("the recipe is unlocked from the start (BDS does not load the recipe without unlock)", () => {
    expect(recipe.unlock).toEqual({ context: "AlwaysUnlocked" });
  });

  it("switches gravity off with yasuflatland:gravity_off and back on with yasuflatland:gravity_on, and syncs the vehicle form to clients (ADR 0021)", () => {
    expect(FORM_PROPERTY).toBe("yasuflatland:form");
    expect(FORMS).toEqual(["car", "takeoff", "hover", "landing", "submarine"]);
    expect(entity.description.properties[FORM_PROPERTY]).toEqual({
      type: "enum",
      values: ["car", "takeoff", "hover", "landing", "submarine"],
      default: "car",
      client_sync: true,
    });
    expect(entity.component_groups["yasuflatland:weightless"]).toEqual({
      "minecraft:physics": { has_gravity: false },
    });
    // Removing a group drops its components instead of restoring the base
    // ones, so landing has to add a group that brings physics back. The
    // in-game flight_land test caught a car that floated after landing.
    expect(entity.component_groups["yasuflatland:weighted"]).toEqual({
      "minecraft:physics": {},
    });
    expect(entity.events[GRAVITY_OFF_EVENT]).toEqual({
      add: { component_groups: ["yasuflatland:weightless"] },
      remove: { component_groups: ["yasuflatland:weighted"] },
    });
    expect(entity.events[GRAVITY_ON_EVENT]).toEqual({
      add: { component_groups: ["yasuflatland:weighted"] },
      remove: { component_groups: ["yasuflatland:weightless"] },
    });
  });

  it("syncs a bank angle to clients whose range holds every angle the script sends (ADR 0026)", () => {
    expect(entity.description.properties[BANK_PROPERTY]).toEqual({
      type: "float",
      range: [-SPEC.maxBank, SPEC.maxBank],
      default: 0,
      client_sync: true,
    });
  });
});

describe("packs/yasuflatland_bp landing gear (ADR 0033)", () => {
  it("syncs whether the wheels are down, down by default for a vehicle on the ground", () => {
    expect(entity.description.properties[GEAR_DOWN_PROPERTY]).toEqual({
      type: "bool",
      default: true,
      client_sync: true,
    });
  });
});

describe("packs/yasuflatland_test_bp", () => {
  // The in-game seat test only says something about the SUV while the probe
  // seats riders exactly as the SUV does (ADR 0019).
  it("the seat probe copies the SUV's rideable, but seats cows instead of players", () => {
    const probe = read(
      "packs/yasuflatland_test_bp/entities/yasuflatland_test/seat_probe.json",
    )["minecraft:entity"].components["minecraft:rideable"];
    expect(probe).toEqual({
      ...c["minecraft:rideable"],
      family_types: ["cow"],
    });
  });
});
