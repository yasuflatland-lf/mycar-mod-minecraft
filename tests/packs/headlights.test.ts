import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HEADLIGHT_SWITCH_TYPE,
  HEADLIGHTS_PROPERTY,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const entity = read("packs/yasuflatland_bp/entities/yasuflatland/suv.json")[
  "minecraft:entity"
];
const client = read(
  "packs/yasuflatland_rp/entity/yasuflatland/suv.entity.json",
)["minecraft:client_entity"].description;
const controller = read(
  "packs/yasuflatland_rp/render_controllers/yasuflatland/suv.render_controllers.json",
).render_controllers["controller.render.yasuflatland.suv"];
const bones: { name: string; parent?: string; cubes?: unknown[] }[] = read(
  "packs/yasuflatland_rp/models/entity/yasuflatland/suv.geo.json",
)["minecraft:geometry"][0].bones;

describe("headlights (ADR 0020)", () => {
  it("the vehicle starts with its headlights off, and the client sees the property", () => {
    expect(entity.description.properties[HEADLIGHTS_PROPERTY]).toEqual({
      type: "bool",
      default: false,
      client_sync: true,
    });
  });

  it("the lamps are a bone of the body that has cubes", () => {
    const lamps = bones.find((b) => b.name === "headlights");
    expect(lamps?.parent).toBe("body");
    expect(lamps?.cubes?.length).toBeGreaterThan(0);
  });

  it("the render controller gives the lamps the glowing material only while the headlights are on", () => {
    expect(controller.materials).toContainEqual({
      headlights: `Array.lamps[query.property('${HEADLIGHTS_PROPERTY}') ? 1 : 0]`,
    });
    expect(controller.arrays.materials["Array.lamps"]).toEqual([
      "Material.lamp",
      "Material.lamp_lit",
    ]);
    expect(client.materials.lamp).toBe("entity");
    expect(client.materials.lamp_lit).toBe("entity_emissive");
  });

  it("has a switch item with an icon, a name, and a recipe unlocked from the start", () => {
    const item = read(
      "packs/yasuflatland_bp/items/yasuflatland/headlight_switch.json",
    )["minecraft:item"];
    expect(item.description.identifier).toBe(HEADLIGHT_SWITCH_TYPE);
    const icon = item.components["minecraft:icon"];
    const texture = read("packs/yasuflatland_rp/textures/item_texture.json")
      .texture_data[icon]?.textures;
    expect(existsSync(`packs/yasuflatland_rp/${texture}.png`)).toBe(true);
    for (const lang of ["en_US", "ja_JP"]) {
      expect(
        readFileSync(`packs/yasuflatland_rp/texts/${lang}.lang`, "utf8"),
      ).toContain(`item.${HEADLIGHT_SWITCH_TYPE}.name=`);
    }
    const recipe = read(
      "packs/yasuflatland_bp/recipes/yasuflatland/headlight_switch.json",
    )["minecraft:recipe_shapeless"];
    expect(recipe.result.item).toBe(HEADLIGHT_SWITCH_TYPE);
    expect(recipe.unlock).toEqual({ context: "AlwaysUnlocked" });
  });
});
