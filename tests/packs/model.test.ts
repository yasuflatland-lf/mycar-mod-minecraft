import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOOR_BY_SEAT, SEAT_POSITIONS } from "../../src/domain/vehicle/seats";

type Vec3 = [number, number, number];

interface Cube {
  origin: Vec3;
  size: Vec3;
  pivot?: Vec3;
  rotation?: Vec3;
}

interface Bone {
  name: string;
  parent?: string;
  pivot?: Vec3;
  cubes?: Cube[];
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
      "rear_glass",
      "windows_sealed",
      "prop_rl",
      "prop_rr",
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

  it("has a glow bone with a hover locator under each wheel (ADR 0022)", () => {
    for (const w of ["fl", "fr", "rl", "rr"]) {
      const wheel = pivot(`wheel_${w}`);
      const glow = pivot(`glow_${w}`);
      expect(glow[0], `glow_${w} x`).toBe(wheel[0]);
      expect(glow[2], `glow_${w} z`).toBe(wheel[2]);
      expect(bones.get(`glow_${w}`)?.locators?.[`hover_${w}`]).toHaveLength(3);
    }
  });

  // The render controller shows the bone by name in flight, and it must roll
  // with the body to hide the upright riders (ADR 0026). The front is -z.
  it("has the rear glass as a child of body at the rear", () => {
    const glass = bones.get("rear_glass");
    expect(glass?.parent).toBe("body");
    const cube = glass?.cubes?.[0];
    if (!cube) throw new Error("rear_glass has no cube");
    expect(cube.origin[2]).toBeGreaterThan(20);
  });

  // The window openings have no glass of their own (ADR 0026), so the plates
  // fill them: each is thin, sits on the body's outer surface, and overlaps no
  // body cube.
  describe("windows_sealed", () => {
    const sealed = bones.get("windows_sealed");
    const plates = sealed?.cubes ?? [];
    const bodyCubes = (bones.get("body")?.cubes ?? []).filter(
      (c) => !c.rotation,
    );
    const span = (c: Cube, a: number): [number, number] => [
      c.origin[a] ?? 0,
      (c.origin[a] ?? 0) + (c.size[a] ?? 0),
    ];

    it("is a child of body with the pivot of rear_glass", () => {
      expect(sealed?.parent).toBe("body");
      expect(sealed?.pivot).toEqual(pivot("rear_glass"));
    });

    it("covers the windshield and the four side windows", () => {
      expect(plates).toHaveLength(5);
    });

    it("has thin plates that overlap no body cube", () => {
      for (const p of plates) {
        expect(Math.min(...p.size)).toBeLessThanOrEqual(0.1);
        for (const c of bodyCubes) {
          const overlaps = [0, 1, 2].every((a) => {
            const [p0, p1] = span(p, a);
            const [c0, c1] = span(c, a);
            return p0 < c1 && c0 < p1;
          });
          expect(overlaps, JSON.stringify(c)).toBe(false);
        }
      }
    });

    // Each plate is flush with the outer face of a pillar it touches, so it
    // reads as glass set in the window frame.
    it("sits flush with the outside of the window frame", () => {
      for (const p of plates) {
        const thin = p.size.indexOf(Math.min(...p.size));
        const [p0, p1] = span(p, thin);
        const outer = Math.abs(p0) > Math.abs(p1) ? p0 : p1;
        const flush = bodyCubes.some((c) => {
          const touches = [0, 1, 2].every((a) => {
            const [c0, c1] = span(c, a);
            const [q0, q1] = span(p, a);
            return q0 <= c1 && c0 <= q1;
          });
          const [c0, c1] = span(c, thin);
          return touches && (Math.abs(c0) > Math.abs(c1) ? c0 : c1) === outer;
        });
        expect(flush, JSON.stringify(p)).toBe(true);
      }
    });

    // Every edge of a plate meets the face of a pillar, the lower frame, a
    // door top or the roof along its whole length, so the plate fills the
    // opening rather than a corner of it.
    it("fills its opening from frame to frame", () => {
      const doors = DOOR_BY_SEAT.flatMap((d) => bones.get(d)?.cubes ?? []);
      const frame = [...bodyCubes, ...doors];
      const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
      for (const p of plates) {
        const thin = p.size.indexOf(Math.min(...p.size));
        const [t0, t1] = span(p, thin);
        const inPlane = [0, 1, 2].filter((a) => a !== thin);
        for (const a of inPlane) {
          const other = inPlane.find((b) => b !== a) ?? 0;
          const [o0, o1] = span(p, other);
          for (const edge of span(p, a)) {
            const met = frame.some((c) => {
              const [c0, c1] = span(c, a);
              const [ct0, ct1] = span(c, thin);
              const [co0, co1] = span(c, other);
              return (
                (near(c0, edge) || near(c1, edge)) &&
                ct0 <= t1 + 1e-6 &&
                t0 <= ct1 + 1e-6 &&
                co0 <= o0 &&
                o1 <= co1
              );
            });
            expect(met, `${JSON.stringify(p)} edge ${a}=${edge}`).toBe(true);
          }
        }
      }
    });
  });

  describe.each(["rl", "rr"])("prop_%s", (side) => {
    const prop = bones.get(`prop_${side}`);
    const wheel = bones.get(`wheel_${side}`);
    // The first tread block is unrotated, so its inner face gives the inner
    // radius of the tire.
    const tread = wheel?.cubes?.[0];
    const innerRadius = (tread?.origin[1] ?? 0) - pivot(`wheel_${side}`)[1];

    it("is a child of root on the axle of its wheel", () => {
      expect(prop?.parent).toBe("root");
      expect(prop?.pivot).toEqual(pivot(`wheel_${side}`));
    });

    it("has a hub and three blades 120 degrees apart", () => {
      const angles = (prop?.cubes ?? [])
        .map((c) => c.rotation?.[0])
        .filter((a): a is number => a !== undefined && a !== 0)
        .map((a) => ((a % 360) + 360) % 360)
        .sort((a, b) => a - b);
      expect(angles).toEqual([120, 240]);
      expect(prop?.cubes?.length).toBeGreaterThanOrEqual(4);
    });

    it("turns its blades only around the axle", () => {
      for (const c of prop?.cubes ?? []) {
        if (!c.rotation) continue;
        expect(c.rotation[1], JSON.stringify(c)).toBe(0);
        expect(c.rotation[2], JSON.stringify(c)).toBe(0);
      }
    });

    it("lies flat in the wheel's plane: every cube is thinnest along x", () => {
      for (const c of prop?.cubes ?? []) {
        const [sx, sy, sz] = c.size;
        expect(sx, JSON.stringify(c)).toBeLessThan(Math.min(sy, sz));
      }
    });

    // The hub cap is the outermost part of the wheel, so the prop starts where
    // the wheel ends and grows outward from there.
    it("is mounted on the outer face of the hub cap", () => {
      const outward = Math.sign(pivot(`wheel_${side}`)[0]);
      const outerX = (c: Cube) =>
        [c.origin[0], c.origin[0] + c.size[0]].map((x) => x * outward);
      const hubFace = Math.max(...(wheel?.cubes ?? []).flatMap(outerX));
      const propXs = (prop?.cubes ?? []).flatMap(outerX);
      expect(Math.min(...propXs)).toBeCloseTo(hubFace, 6);
    });

    // A rotation around x about the axle keeps every corner's distance from it,
    // so the unrotated corners are enough.
    it("fits inside the tire's inner radius in the wheel's plane", () => {
      expect(innerRadius).toBeGreaterThan(0);
      const [, py, pz] = pivot(`prop_${side}`);
      for (const c of prop?.cubes ?? []) {
        if (c.rotation) expect(c.pivot).toEqual(prop?.pivot);
        for (const y of [c.origin[1], c.origin[1] + c.size[1]])
          for (const z of [c.origin[2], c.origin[2] + c.size[2]])
            expect(Math.hypot(y - py, z - pz)).toBeLessThan(innerRadius);
      }
    });
  });
});
