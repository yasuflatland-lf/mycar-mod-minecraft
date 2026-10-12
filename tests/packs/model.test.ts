import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOOR_BY_SEAT } from "../../src/domain/vehicle/kinds/suv/entity";
import { SUV_PROFILE } from "../../src/domain/vehicle/kinds/suv/profile";

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
  readFileSync(
    "packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json",
    "utf8",
  ),
);
const geometry = geo["minecraft:geometry"][0];
const bones = new Map<string, Bone>(
  geometry.bones.map((b: Bone) => [b.name, b]),
);
const anims = JSON.parse(
  readFileSync("packs/yasu_ride_rp/animations/yasu_ride/suv.anim.json", "utf8"),
).animations;

// How far the hover animation moves each folded wheel out (ADR 0043). Read
// from the hand-written animation, so the generated glow and arms must follow
// it.
const FOLD_OUT = Math.abs(
  anims["animation.yasu_ride.suv.wheels_folded"].bones.wheel_fl.position[0],
);

function pivot(name: string): Vec3 {
  const p = bones.get(name)?.pivot;
  if (!p) throw new Error(`${name} has no pivot`);
  return p;
}

describe("SUV model (ADR 0009)", () => {
  it("has the geometry identifier", () => {
    expect(geometry.description.identifier).toBe("geometry.yasu_ride.suv");
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

  // SUV_PROFILE.seats.positions uses x = left, and so does the model once it faces -z.
  it("puts each seat, its door and the same-side wheels on the side SUV_PROFILE.seats.positions names", () => {
    for (const [i, seat] of SUV_PROFILE.seats.positions.entries()) {
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
      expect(anims[`animation.yasu_ride.suv.${d}`].bones[d]).toBeDefined();
  });

  // A positive y rotation turns +z toward +x, as seen in game: +70 on the right
  // doors (geometry x < 0, panel toward +z) swung them into the cabin.
  it("swings each door outward from the body", () => {
    for (const d of DOOR_BY_SEAT) {
      const keys = Object.values<Vec3>(
        anims[`animation.yasu_ride.suv.${d}`].bones[d].rotation,
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

  // The folded wheels hang FOLD_OUT px out from their axles, and the glow
  // stays under them.
  it("has a glow bone with a hover locator under each folded wheel (ADR 0022)", () => {
    for (const w of ["fl", "fr", "rl", "rr"]) {
      const wheel = pivot(`wheel_${w}`);
      const glow = pivot(`glow_${w}`);
      expect(glow[0], `glow_${w} x`).toBe(
        wheel[0] + FOLD_OUT * Math.sign(wheel[0]),
      );
      expect(glow[2], `glow_${w} z`).toBe(wheel[2]);
      expect(bones.get(`glow_${w}`)?.locators?.[`hover_${w}`]).toHaveLength(3);
    }
  });

  // Each arm runs from inside the wheel arch down and out to the hub on top
  // of the folded wheel, which sits FOLD_OUT px out and 4 px down (ADR 0043).
  it("has an arm from the wheel arch to each folded wheel's hub (ADR 0043)", () => {
    for (const w of ["fl", "fr", "rl", "rr"]) {
      const wheel = pivot(`wheel_${w}`);
      const out = Math.sign(wheel[0]);
      const arm = bones.get(`arm_${w}`);
      const cubes = arm?.cubes ?? [];
      expect(arm?.parent).toBe("root");
      const xs = cubes.flatMap((c) => [c.origin[0], c.origin[0] + c.size[0]]);
      const ys = cubes.flatMap((c) => [c.origin[1], c.origin[1] + c.size[1]]);
      const hubX = Math.abs(wheel[0]) + FOLD_OUT;
      expect(Math.min(...xs.map((x) => x * out))).toBeLessThan(13);
      expect(Math.max(...xs.map((x) => x * out))).toBeGreaterThan(hubX);
      // The folded tire spans y 0 to 4, so the arm rests on its top face.
      expect(Math.min(...ys)).toBeCloseTo(4, 6);
      for (const c of cubes) {
        expect(c.rotation, `arm_${w}`).toBeUndefined();
        // Each arm stays in its own wheel's plane, centered on the axle in z.
        expect(c.origin[2], `arm_${w}`).toBeLessThan(wheel[2]);
        expect(c.origin[2] + c.size[2], `arm_${w}`).toBeGreaterThan(wheel[2]);
      }
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
  // fill them: the windshield plate leans with the A-pillars, and the side
  // plates are thin, sit in the window frames, and overlap no body cube.
  describe("windows_sealed", () => {
    const sealed = bones.get("windows_sealed");
    const plates = sealed?.cubes ?? [];
    const sidePlates = plates.filter((c) => !c.rotation);
    const allBodyCubes = bones.get("body")?.cubes ?? [];
    const bodyCubes = allBodyCubes.filter((c) => !c.rotation);
    const doorCubes = DOOR_BY_SEAT.flatMap((d) => bones.get(d)?.cubes ?? []);
    const frame = [...bodyCubes, ...doorCubes.filter((c) => !c.rotation)];
    const EPS = 1e-6;
    const span = (c: Cube, a: number): [number, number] => [
      c.origin[a] ?? 0,
      (c.origin[a] ?? 0) + (c.size[a] ?? 0),
    ];
    const thinAxis = (c: Cube) => c.size.indexOf(Math.min(...c.size));
    // A right-handed x rotation. The game turns a cube's x rotation the other
    // way (ADR 0051): a written -25 leans the A-pillars' tops back toward +z,
    // the cabin. So inside() undoes a cube's rotation with +rx.
    const turnX = (p: Vec3, pivot: Vec3, degrees: number): Vec3 => {
      const r = (degrees * Math.PI) / 180;
      const [y, z] = [p[1] - pivot[1], p[2] - pivot[2]];
      return [
        p[0],
        y * Math.cos(r) - z * Math.sin(r) + pivot[1],
        y * Math.sin(r) + z * Math.cos(r) + pivot[2],
      ];
    };
    const inside = (c: Cube, p: Vec3) => {
      const local = turnX(p, c.pivot ?? [0, 0, 0], c.rotation?.[0] ?? 0);
      return local.every((v, a) => {
        const [c0, c1] = span(c, a);
        return c0 - EPS <= v && v <= c1 + EPS;
      });
    };

    it("is a child of body with the pivot of rear_glass", () => {
      expect(sealed?.parent).toBe("body");
      expect(sealed?.pivot).toEqual(pivot("rear_glass"));
    });

    it("has one windshield plate, leaning with the A-pillars", () => {
      const leaning = plates.filter((c) => c.rotation);
      expect(leaning).toHaveLength(1);
      const [windshield] = leaning;
      const pillars = allBodyCubes.filter(
        (c) => c.rotation && c.size[0] === 1 && c.size[1] > 10,
      );
      expect(pillars).toHaveLength(2);
      // In game a negative x rotation leans the top back toward +z, the cabin
      expect(windshield?.rotation?.[0]).toBeLessThan(0);
      for (const pillar of pillars) {
        expect(windshield?.rotation).toEqual(pillar.rotation);
        expect(windshield?.pivot).toEqual(pillar.pivot);
      }
    });

    it("covers the window above each door", () => {
      for (const d of DOOR_BY_SEAT) {
        const panel = bones.get(d)?.cubes?.[0];
        if (!panel) throw new Error(`${d} has no cube`);
        const [z0, z1] = span(panel, 2);
        const side = Math.sign(pivot(d)[0]);
        const covered = sidePlates.some(
          (p) =>
            Math.sign(p.origin[0]) === side &&
            z0 <= p.origin[2] &&
            p.origin[2] + p.size[2] <= z1,
        );
        expect(covered, d).toBe(true);
      }
    });

    it("has thin side plates that overlap no body cube", () => {
      for (const p of sidePlates) {
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

    // Each side plate sits at most 0.05 px inside the outer face of a frame
    // piece it touches, so it reads as glass set in the window frame.
    it("sits in the window frame, at its outer face", () => {
      for (const p of sidePlates) {
        const thin = thinAxis(p);
        const [p0, p1] = span(p, thin);
        const outer = Math.max(Math.abs(p0), Math.abs(p1));
        const flush = frame.some((c) => {
          const touches = [0, 1, 2].every((a) => {
            const [c0, c1] = span(c, a);
            const [q0, q1] = span(p, a);
            return q0 <= c1 && c0 <= q1;
          });
          const [c0, c1] = span(c, thin);
          const gap = Math.max(Math.abs(c0), Math.abs(c1)) - outer;
          return touches && gap > -EPS && gap <= 0.05 + EPS;
        });
        expect(flush, JSON.stringify(p)).toBe(true);
      }
    });

    // Every edge of a side plate meets the face of a pillar, a door frame or
    // the roof along its whole length, so the plates fill the opening rather
    // than a corner of it. The front side windows are trapezoids under the
    // leaning front post, built from strips: a strip's front end reaches into
    // that post, and where a strip meets the next one, the part the next one
    // does not cover lies inside the post.
    it("fills its opening from frame to frame", () => {
      const posts = doorCubes.filter((c) => c.rotation);
      const near = (a: number, b: number) => Math.abs(a - b) < EPS;
      for (const p of sidePlates) {
        const thin = thinAxis(p);
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
                ct0 <= t1 + EPS &&
                t0 <= ct1 + EPS &&
                co0 <= o0 &&
                o1 <= co1
              );
            });
            const at = (o: number): Vec3 => {
              const point: Vec3 = [0, 0, 0];
              point[thin] = (t0 + t1) / 2;
              point[a] = edge;
              point[other] = o;
              return point;
            };
            const inPost = (from: number, to: number) =>
              posts.some((c) => inside(c, at(from)) && inside(c, at(to)));
            const byNeighbor = sidePlates.some((n) => {
              if (n === p || !span(n, a).some((e) => near(e, edge)))
                return false;
              // The mirrored plate on the other side has the same spans
              if (Math.sign(n.origin[0]) !== Math.sign(p.origin[0]))
                return false;
              const [n0, n1] = span(n, other);
              if (n1 <= o0 || o1 <= n0) return false;
              return (
                (n0 <= o0 || inPost(o0, n0)) && (o1 <= n1 || inPost(n1, o1))
              );
            });
            expect(
              met || inPost(o0, o1) || byNeighbor,
              `${JSON.stringify(p)} edge ${a}=${edge}`,
            ).toBe(true);
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

    // A ship propeller (ADR 0042): four scimitar blades, each built from
    // segments that turn further around the axle toward the tip, so the blade
    // sweeps back. Blade segments sit wholly on one side of the axle before
    // they are turned; the hub cubes are centered on it.
    it("has four blades 90 degrees apart, each swept further toward the tip", () => {
      const [, py] = pivot(`prop_${side}`);
      const reach = (c: Cube) => c.origin[1] + c.size[1] - py;
      const blades = (prop?.cubes ?? []).filter((c) => c.origin[1] > py);
      // Sweeps stay under 45 degrees, so the nearest multiple of 90 is the
      // blade a segment belongs to. gen_model.py turns the model 180 degrees
      // about y before writing it, which negates rotations about x, so only
      // the sweep's size has to grow toward the tip; its sign is pinned to be
      // the same on both props below.
      const angle = (c: Cube) => c.rotation?.[0] ?? 0;
      const nearestRightAngle = (c: Cube) => Math.round(angle(c) / 90);
      const quadrants = new Map<number, Cube[]>();
      for (const c of blades) {
        const q = ((nearestRightAngle(c) % 4) + 4) % 4;
        quadrants.set(q, [...(quadrants.get(q) ?? []), c]);
      }
      expect([...quadrants.keys()].sort()).toEqual([0, 1, 2, 3]);
      const sweeps = [...quadrants.values()].map((segments) =>
        segments
          .sort((a, b) => reach(a) - reach(b))
          .map((c) => angle(c) - nearestRightAngle(c) * 90),
      );
      for (const s of sweeps) {
        expect(s, JSON.stringify(s)).toEqual(sweeps[0]);
        expect(s.length).toBeGreaterThanOrEqual(3);
        for (let i = 1; i < s.length; i++) {
          expect(Math.abs(s[i] ?? 0), JSON.stringify(s)).toBeGreaterThan(
            Math.abs(s[i - 1] ?? 0),
          );
          expect(Math.sign(s[i] ?? 0) * Math.sign(s.at(-1) ?? 0)).toBe(1);
        }
      }
    });

    it("sweeps its blades the same way as the other prop", () => {
      const other = bones.get(side === "rl" ? "prop_rr" : "prop_rl");
      const angles = (cubes: Cube[] | undefined) =>
        (cubes ?? []).map((c) => c.rotation?.[0] ?? 0).sort((a, b) => a - b);
      expect(angles(prop?.cubes)).toEqual(angles(other?.cubes));
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
