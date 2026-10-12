import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/vehicle/paint";
import {
  HEADLIGHTS_PROPERTY,
  PAINT_VARIANT,
  paintEvent,
  VEHICLE_FAMILY,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const RP = "packs/yasu_ride_rp";
const entity = read("packs/yasu_ride_bp/entities/yasu_ride/sportsboat.se.json")[
  "minecraft:entity"
];
const c = entity.components;
const client = read(`${RP}/entity/yasu_ride/sportsboat.ce.json`)[
  "minecraft:client_entity"
].description;
const controller = read(`${RP}/render_controllers/yasu_ride/sportsboat.rc.json`)
  .render_controllers["controller.render.yasu_ride.sportsboat"];
const geometry = read(`${RP}/models/entity/yasu_ride/sportsboat.geo.json`)[
  "minecraft:geometry"
][0];

describe("sports boat Behavior Pack entity (ADR 0051)", () => {
  it("has a collision box 2.2 wide and 1.2 high", () => {
    expect(c["minecraft:collision_box"]).toEqual({ width: 2.2, height: 1.2 });
  });

  it("has three hit boxes along the 6-block hull, since hits outside the square collision box miss", () => {
    expect(c["minecraft:custom_hit_test"].hitboxes).toEqual(
      [-1.6, 0, 1.6].map((z) => ({
        width: 2.2,
        height: 1.4,
        pivot: [0, 0.7, z],
      })),
    );
  });

  it("floats with minecraft:buoyant, gravity on and no waves", () => {
    expect(c["minecraft:buoyant"]).toEqual({
      base_buoyancy: 1.0,
      apply_gravity: true,
      simulate_waves: false,
      big_wave_probability: 0,
      liquid_blocks: ["minecraft:water", "minecraft:flowing_water"],
    });
  });

  it("has four seats at the SUV's x and z, 0.52 up, with the driver in seat 0", () => {
    const rideable = c["minecraft:rideable"];
    expect(rideable.controlling_seat).toBe(0);
    expect(rideable.family_types).toEqual(["player"]);
    expect(rideable.crouching_skip_interact).toBe(true);
    expect(
      rideable.seats.map((s: { position: number[] }) => s.position),
    ).toEqual([
      [-0.38, 0.52, 0.35],
      [0.38, 0.52, 0.35],
      [-0.38, 0.52, -0.8],
      [0.38, 0.52, -0.8],
    ]);
    expect(rideable.seats[0].lock_rider_rotation).toBe(90);
  });

  it("is in the vehicle family, so the script's family query finds it", () => {
    expect(c["minecraft:type_family"].family).toEqual([
      VEHICLE_FAMILY,
      "inanimate",
    ]);
  });

  it("takes no damage (ADR 0006)", () => {
    expect(c["minecraft:damage_sensor"].triggers).toEqual({
      cause: "all",
      deals_damage: "no",
    });
  });

  it("each paint event sets that paint's variant and drops the other paints", () => {
    expect(c["minecraft:variant"].value).toBe(0);
    expect(Object.keys(entity.component_groups).sort()).toEqual(
      PAINTS.map((p) => `yasu_ride:paint_${p}`).sort(),
    );
    expect(Object.keys(entity.events).sort()).toEqual(
      PAINTS.map(paintEvent).sort(),
    );
    for (const paint of PAINTS) {
      const event = entity.events[paintEvent(paint)];
      const [group] = event.add.component_groups;
      expect(
        entity.component_groups[group]["minecraft:variant"].value,
        paint,
      ).toBe(PAINT_VARIANT[paint]);
      expect(new Set([group, ...event.remove.component_groups])).toEqual(
        new Set(PAINTS.map((p) => `yasu_ride:paint_${p}`)),
      );
    }
  });

  it("has only the headlights property: no form, bank, or gear", () => {
    expect(Object.keys(entity.description.properties)).toEqual([
      HEADLIGHTS_PROPERTY,
    ]);
  });
});

describe("sports boat Resource Pack (ADR 0051)", () => {
  it("picks one of 16 paint textures by variant, black (variant 0) as sportsboat.png", () => {
    expect(controller.textures).toEqual(["Array.paints[query.variant]"]);
    const slots: string[] = controller.arrays.textures["Array.paints"];
    expect(slots).toHaveLength(PAINTS.length);
    for (const paint of PAINTS) {
      const key = slots[PAINT_VARIANT[paint]]?.replace("Texture.", "") ?? "";
      const path = client.textures[key];
      expect(path, paint).toBe(
        paint === "khaki"
          ? "textures/entity/yasu_ride/sportsboat"
          : `textures/entity/yasu_ride/sportsboat_${paint}`,
      );
      expect(existsSync(`${RP}/${path}.png`), path).toBe(true);
    }
  });

  it("draws the windshield with the alpha-blended glass material", () => {
    expect(controller.materials).toContainEqual({
      windshield: "Material.glass",
    });
    expect(client.materials.glass).toBe("entity_alphablend");
  });

  it("names the bones root, body, headlights, and windshield (ADR 0009)", () => {
    expect(geometry.bones.map((b: { name: string }) => b.name)).toEqual([
      "root",
      "body",
      "headlights",
      "windshield",
    ]);
  });
});
