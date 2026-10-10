// tests/packs/behaviorPack.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEAT_POSITIONS } from "../../src/domain/vehicle/seats";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const c = read("packs/mycar_bp/entities/suv.json")["minecraft:entity"]
  .components;

describe("packs/mycar_bp", () => {
  it("当たり判定は幅 1.8・高さ 1.6 (ADR 0009)", () => {
    expect(c["minecraft:collision_box"]).toEqual({ width: 1.8, height: 1.6 });
  });

  it("座席の位置と順番が SEAT_POSITIONS と一致し、運転席は 0 (ADR 0007)", () => {
    const seats = c["minecraft:rideable"].seats;
    expect(c["minecraft:rideable"].controlling_seat).toBe(0);
    expect(seats).toHaveLength(4);
    seats.forEach((s: any, i: number) => {
      expect(s.position[0]).toBe(SEAT_POSITIONS[i]!.x);
      expect(s.position[2]).toBe(SEAT_POSITIONS[i]!.z);
    });
    expect(seats[0].lock_rider_rotation).toBe(90);
  });

  it("車はダメージを受けない (ADR 0006)", () => {
    expect(c["minecraft:damage_sensor"].triggers).toEqual({
      cause: "all",
      deals_damage: "no",
    });
  });

  it("1 段の段差はエンジンに任せる (ADR 0004)", () => {
    expect(c["minecraft:variable_max_auto_step"].base_value).toBe(1.0625);
  });

  it("アイテムとレシピがある (ADR 0008)", () => {
    expect(
      read("packs/mycar_bp/items/suv_item.json")["minecraft:item"].description
        .identifier,
    ).toBe("mycar:suv_item");
    expect(
      read("packs/mycar_bp/recipes/suv_item.json")["minecraft:recipe_shaped"]
        .result.item,
    ).toBe("mycar:suv_item");
  });

  it("レシピは最初から解放されている (unlock がないと BDS がレシピを読み込まない)", () => {
    expect(
      read("packs/mycar_bp/recipes/suv_item.json")["minecraft:recipe_shaped"]
        .unlock,
    ).toEqual({ context: "AlwaysUnlocked" });
  });
});
