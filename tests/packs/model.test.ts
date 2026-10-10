import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOOR_BY_SEAT } from "../../src/domain/vehicle/seats";

const geo = JSON.parse(readFileSync("packs/mycar_rp/models/entity/suv.geo.json", "utf8"));
const g = geo["minecraft:geometry"][0];
const bones = new Map<string, any>(g.bones.map((b: any) => [b.name, b]));
const anims = JSON.parse(readFileSync("packs/mycar_rp/animations/suv.animation.json", "utf8")).animations;

describe("SUV model (ADR 0009)", () => {
  it("ジオメトリの識別子", () => {
    expect(g.description.identifier).toBe("geometry.mycar.suv");
  });

  it("規約のボーンがそろっている", () => {
    for (const name of ["root", "body", "wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr", ...DOOR_BY_SEAT, "seat_0", "seat_1", "seat_2", "seat_3"]) {
      expect(bones.has(name), name).toBe(true);
    }
  });

  it("正面は -z (ボンネットとグリルの箱が -z 側にある)", () => {
    const zs = bones.get("body").cubes.map((c: any) => c.origin[2]);
    expect(Math.min(...zs)).toBeLessThan(-24);
  });

  it("ロケーター exhaust が body にある", () => {
    expect(bones.get("body").locators.exhaust).toHaveLength(3);
  });

  it("ドアごとに開閉のアニメーションがある", () => {
    for (const d of DOOR_BY_SEAT) expect(anims[`animation.mycar.suv.${d}`].bones[d]).toBeDefined();
  });
});
