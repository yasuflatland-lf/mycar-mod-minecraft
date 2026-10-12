import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defined } from "../support/defined";
import type { Json } from "../support/packFiles";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const blockFile = read(`${BP}/blocks/yasu_ride/deck_floor.block.json`);
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

  it("defines one collision height permutation for each pixel from 1 to 16", () => {
    expect(block.description.states).toEqual({ "yasu_ride:height": heights });
    expect(block.permutations).toEqual(
      heights.map((height) => ({
        condition: `q.block_state('yasu_ride:height') == ${height}`,
        components: {
          "minecraft:collision_box": {
            origin: [-8, 0, -8],
            size: [16, height, 16],
          },
        },
      })),
    );
  });

  it("references an invisible model with a root bone and no cubes", () => {
    const file = read(`${RP}/models/blocks/yasu_ride/deck_floor.geo.json`);
    expect(file.format_version).toBe("1.12.0");
    expect(block.components["minecraft:geometry"]).toBe(
      "geometry.yasu_ride.deck_floor",
    );
    expect(file["minecraft:geometry"]).toEqual([
      {
        description: {
          identifier: "geometry.yasu_ride.deck_floor",
          texture_width: 16,
          texture_height: 16,
        },
        bones: [{ name: "root", pivot: [0, 0, 0] }],
      },
    ]);
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
