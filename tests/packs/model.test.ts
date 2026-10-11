import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOOR_BY_SEAT, SEAT_POSITIONS } from "../../src/domain/vehicle/seats";

type Vec3 = [number, number, number];

interface Bone {
  name: string;
  pivot?: Vec3;
  cubes?: { origin: Vec3; size: Vec3 }[];
  locators?: Record<string, Vec3>;
}

const geo = JSON.parse(
  readFileSync("packs/mycar_rp/models/entity/suv.geo.json", "utf8"),
);
const geometry = geo["minecraft:geometry"][0];
const bones = new Map<string, Bone>(
  geometry.bones.map((b: Bone) => [b.name, b]),
);
const anims = JSON.parse(
  readFileSync("packs/mycar_rp/animations/suv.animation.json", "utf8"),
).animations;

function pivot(name: string): Vec3 {
  const p = bones.get(name)?.pivot;
  if (!p) throw new Error(`${name} has no pivot`);
  return p;
}

describe("SUV model (ADR 0009)", () => {
  it("has the geometry identifier", () => {
    expect(geometry.description.identifier).toBe("geometry.mycar.suv");
  });

  it("has all the conventional bones", () => {
    for (const name of [
      "root",
      "body",
      "wheel_fl",
      "wheel_fr",
      "wheel_rl",
      "wheel_rr",
      ...DOOR_BY_SEAT,
      "seat_0",
      "seat_1",
      "seat_2",
      "seat_3",
    ]) {
      expect(bones.has(name), name).toBe(true);
    }
  });

  // The body is nearly symmetric front to back, so its extent cannot tell the
  // front from the rear; the named bones can.
  it("faces -z: front wheels, front doors and front seats sit at lower z than the rear ones", () => {
    for (const side of ["l", "r"]) {
      expect(pivot(`wheel_f${side}`)[2]).toBeLessThan(
        pivot(`wheel_r${side}`)[2],
      );
      expect(pivot(`door_f${side}`)[2]).toBeLessThan(pivot(`door_r${side}`)[2]);
    }
    expect(pivot("seat_0")[2]).toBeLessThan(pivot("seat_2")[2]);
    expect(pivot("seat_1")[2]).toBeLessThan(pivot("seat_3")[2]);
  });

  // SEAT_POSITIONS uses x = left, and so does the model once it faces -z.
  it("puts each seat, its door and the same-side wheels on the side SEAT_POSITIONS names", () => {
    for (const [i, seat] of SEAT_POSITIONS.entries()) {
      const side = Math.sign(seat.x);
      const door = DOOR_BY_SEAT[i] ?? "";
      const letter = door.at(-1);
      expect(Math.sign(pivot(`seat_${i}`)[0]), `seat_${i}`).toBe(side);
      expect(Math.sign(pivot(door)[0]), door).toBe(side);
      for (const w of [`wheel_f${letter}`, `wheel_r${letter}`])
        expect(Math.sign(pivot(w)[0]), w).toBe(side);
    }
  });

  it("has the exhaust locator on body", () => {
    expect(bones.get("body")?.locators?.exhaust).toHaveLength(3);
  });

  it("has an open/close animation for each door", () => {
    for (const d of DOOR_BY_SEAT)
      expect(anims[`animation.mycar.suv.${d}`].bones[d]).toBeDefined();
  });

  // A positive y rotation turns +z toward +x, as seen in game: +70 on the right
  // doors (geometry x < 0, panel toward +z) swung them into the cabin.
  it("swings each door outward from the body", () => {
    for (const d of DOOR_BY_SEAT) {
      const keys = Object.values<Vec3>(
        anims[`animation.mycar.suv.${d}`].bones[d].rotation,
      );
      const openY = keys.reduce(
        (a, k) => (Math.abs(k[1]) > Math.abs(a) ? k[1] : a),
        0,
      );
      const [hingeX, , hingeZ] = pivot(d);
      const cube = bones.get(d)?.cubes?.[0];
      if (!cube) throw new Error(`${d} has no cube`);
      const panelZ = cube.origin[2] + cube.size[2] / 2 - hingeZ;
      const swungX = panelZ * Math.sin((openY * Math.PI) / 180);
      expect(Math.sign(swungX), d).toBe(Math.sign(hingeX));
    }
  });

  it("has a glow bone with a hover locator under each wheel (ADR 0021)", () => {
    for (const w of ["fl", "fr", "rl", "rr"]) {
      const wheel = pivot(`wheel_${w}`);
      const glow = pivot(`glow_${w}`);
      expect(glow[0], `glow_${w} x`).toBe(wheel[0]);
      expect(glow[2], `glow_${w} z`).toBe(wheel[2]);
      expect(bones.get(`glow_${w}`)?.locators?.[`hover_${w}`]).toHaveLength(3);
    }
  });
});
