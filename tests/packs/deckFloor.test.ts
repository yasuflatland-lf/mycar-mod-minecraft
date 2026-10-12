import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defined } from "../support/defined";
import { type Json, jsonFileEntries } from "../support/packFiles";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const blockFile = defined(
  jsonFileEntries(`${BP}/blocks/yasu_ride`).find(
    ({ path }) => path === "deck_floor.block.json",
  ),
  "deck floor block",
).json;
const block = blockFile["minecraft:block"] as {
  description: {
    identifier: string;
    menu_category: Json;
    states: Json;
  };
  components: Json;
  permutations: { condition: string; components: Json }[];
};
const heights = Array.from({ length: 16 }, (_, i) => i + 1);

describe("Boat deck floor (ADR 0063)", () => {
  it("is hidden from inventory and selection, indestructible, and has no loot", () => {
    expect(blockFile.format_version).toBe("1.21.80");
    expect(block.description.identifier).toBe("yasu_ride:deck_floor");
    expect(block.description.menu_category).toEqual({ category: "none" });
    expect(block.components["minecraft:selection_box"]).toBe(false);
    expect(block.components["minecraft:destructible_by_mining"]).toBe(false);
    expect(block.components["minecraft:destructible_by_explosion"]).toBe(false);
    expect(block.components).not.toHaveProperty("minecraft:loot");
    expect(block.components["minecraft:light_dampening"]).toBe(0);
    expect(block.components["minecraft:material_instances"]).toEqual({
      "*": { texture: "glass", render_method: "alpha_test" },
    });
  });

  it("defines exactly one collision height permutation for each pixel from 1 to 16", () => {
    expect(block.description.states).toEqual({ "yasu_ride:height": heights });
    expect(block.permutations).toHaveLength(heights.length);
    for (const height of heights) {
      expect(
        block.permutations.filter(
          (p) =>
            p.condition === `q.block_state('yasu_ride:height') == ${height}`,
        ),
      ).toEqual([
        {
          condition: `q.block_state('yasu_ride:height') == ${height}`,
          components: {
            "minecraft:collision_box": {
              origin: [-8, 0, -8],
              size: [16, height, 16],
            },
          },
        },
      ]);
    }
  });

  it("references an invisible model with a root bone and no cubes", () => {
    const file = defined(
      jsonFileEntries(`${RP}/models/blocks/yasu_ride`).find(
        ({ path }) => path === "deck_floor.geo.json",
      ),
      "deck floor model",
    ).json;
    expect(file.format_version).toBe("1.12.0");
    const geometries = file["minecraft:geometry"] as {
      description: Json;
      bones: { name: string; pivot: number[]; cubes?: unknown[] }[];
    }[];
    expect(geometries).toHaveLength(1);
    const geometry = defined(geometries[0], "deck floor geometry");
    expect(block.components["minecraft:geometry"]).toBe(
      "geometry.yasu_ride.deck_floor",
    );
    expect(geometry.description).toEqual({
      identifier: block.components["minecraft:geometry"],
      texture_width: 16,
      texture_height: 16,
    });
    expect(geometry.bones).toEqual([{ name: "root", pivot: [0, 0, 0] }]);
    for (const bone of geometry.bones) expect(bone.cubes ?? []).toEqual([]);
  });

  it.each(["en_US", "ja_JP"])("names the block in %s", (locale) => {
    const names = readFileSync(`${RP}/texts/${locale}.lang`, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.startsWith("tile.yasu_ride:deck_floor.name="))
      .map((line) => line.slice(line.indexOf("=") + 1));
    expect(names).toHaveLength(1);
    expect(defined(names[0], locale).trim()).not.toBe("");
    if (locale === "en_US") expect(names[0]).toBe("Boat Deck");
  });
});
