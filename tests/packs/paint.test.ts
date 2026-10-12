import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/vehicle/paint";
import {
  PAINT_BY_DYE,
  PAINT_VARIANT,
  paintEvent,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const entity = read("packs/yasu_ride_bp/entities/yasu_ride/suv.se.json")[
  "minecraft:entity"
];
const client = read("packs/yasu_ride_rp/entity/yasu_ride/suv.ce.json")[
  "minecraft:client_entity"
].description;
const controller = read(
  "packs/yasu_ride_rp/render_controllers/yasu_ride/suv.rc.json",
).render_controllers["controller.render.yasu_ride.suv"];

describe("vehicle paints (ADR 0031)", () => {
  it("a new vehicle starts khaki", () => {
    expect(entity.components["minecraft:variant"].value).toBe(
      PAINT_VARIANT.khaki,
    );
  });

  it("each paint event sets that paint's variant and drops the other paints", () => {
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

  it("the render controller picks each paint's texture by its variant, and the texture exists", () => {
    expect(client.render_controllers).toEqual([
      "controller.render.yasu_ride.suv",
    ]);
    expect(controller.textures).toEqual(["Array.paints[query.variant]"]);
    const slots: string[] = controller.arrays.textures["Array.paints"];
    for (const paint of PAINTS) {
      const key = slots[PAINT_VARIANT[paint]]?.replace("Texture.", "") ?? "";
      const path = client.textures[key];
      expect(path, paint).toMatch(
        paint === "khaki" ? /\/suv$/ : new RegExp(`/suv_${paint}$`),
      );
      expect(existsSync(`packs/yasu_ride_rp/${path}.png`), path).toBe(true);
    }
  });

  it("each of the 16 vanilla dyes maps to its own paint, and brown dye restores khaki", () => {
    const colors = [
      "white",
      "light_gray",
      "gray",
      "black",
      "brown",
      "red",
      "orange",
      "yellow",
      "lime",
      "green",
      "cyan",
      "light_blue",
      "blue",
      "purple",
      "magenta",
      "pink",
    ];
    expect(Object.keys(PAINT_BY_DYE).sort()).toEqual(
      colors.map((c) => `minecraft:${c}_dye`).sort(),
    );
    expect(Object.values(PAINT_BY_DYE).sort()).toEqual([...PAINTS].sort());
    expect(PAINT_BY_DYE["minecraft:brown_dye"]).toBe("khaki");
  });

  it("khaki, green, and red keep the variants ADR 0017 gave them", () => {
    expect(PAINTS.slice(0, 3)).toEqual(["khaki", "green", "red"]);
  });
});
