import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defined } from "../support/defined";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const RP = "packs/mycar_rp";
const client = read(`${RP}/entity/suv.entity.json`)["minecraft:client_entity"]
  .description;
const anims = read(`${RP}/animations/suv.animation.json`).animations;
const controller = read(
  `${RP}/animation_controllers/suv.animation_controllers.json`,
).animation_controllers["controller.animation.mycar.suv.form"];
const render = read(`${RP}/render_controllers/suv.render_controllers.json`)
  .render_controllers["controller.render.mycar.suv"];
const particle = read(`${RP}/particles/hover_glow.json`).particle_effect;
const WHEELS = ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"];

describe("Resource Pack flight visuals (ADR 0022)", () => {
  it("has no obsolete vehicle property references (ADR 0038)", () => {
    // Split so that the issue's grep for the old name over src, tests, packs,
    // tools, docs, and manual-test.md does not match this test.
    for (const file of readdirSync(RP, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (file.isFile() && file.name.endsWith(".json"))
        expect(
          readFileSync(`${file.parentPath}/${file.name}`, "utf8"),
        ).not.toContain("mycar:" + "flight");
    }
  });
  it("runs the form controller and the custom render controller with an emissive material", () => {
    expect(client.scripts.animate).toContain("form");
    expect(client.animations.form).toBe("controller.animation.mycar.suv.form");
    expect(client.render_controllers).toEqual(["controller.render.mycar.suv"]);
    expect(client.materials.default).toBe("entity_emissive_alpha");
    expect(client.particle_effects.hover_glow).toBe(
      particle.description.identifier,
    );
  });

  it("spins the wheels only on the ground and folds them through deploy, hover and retract", () => {
    const s = controller.states;
    expect(controller.initial_state).toBe("ground");
    expect(s.ground.animations).toEqual(["wheels"]);
    expect(s.deploy.animations).toEqual(["wheels_deploy"]);
    expect(s.hover.animations.slice(0, 2)).toEqual([
      "wheels_folded",
      "hover_glow",
    ]);
    expect(s.retract.animations).toEqual(["wheels_retract"]);
    // The wheels follow the landing gear, so they unfold before touchdown (ADR 0033).
    expect(s.ground.transitions).toContainEqual({
      deploy: "!query.property('mycar:gear_down')",
    });
    expect(s.hover.transitions).toEqual([
      { retract: "query.property('mycar:gear_down')" },
    ]);
  });

  it("every animation a controller state plays resolves to an animation in the pack", () => {
    for (const [name, state] of Object.entries(controller.states)) {
      const entries = (state as { animations: (string | object)[] }).animations;
      for (const entry of entries) {
        // A conditional entry is { name: condition }.
        const short =
          typeof entry === "string" ? entry : (Object.keys(entry)[0] ?? "");
        const id = client.animations[short];
        expect(id, `${name}: ${short}`).toBeDefined();
        expect(anims[id], `${name}: ${id}`).toBeDefined();
      }
    }
  });

  it("folds every wheel 90 degrees and lowers it 4 px, with the two sides turning opposite ways", () => {
    const folded = anims["animation.mycar.suv.wheels_folded"].bones;
    for (const w of WHEELS) {
      expect(Math.abs(folded[w].rotation[2]), w).toBe(90);
      expect(folded[w].position, w).toEqual([0, -4, 0]);
    }
    expect(folded.wheel_fl.rotation[2]).toBe(-folded.wheel_fr.rotation[2]);
    expect(folded.wheel_rl.rotation[2]).toBe(folded.wheel_fl.rotation[2]);
    expect(folded.wheel_rr.rotation[2]).toBe(folded.wheel_fr.rotation[2]);
  });

  it("deploys into the folded pose and retracts out of it", () => {
    const folded = anims["animation.mycar.suv.wheels_folded"].bones;
    const deploy = anims["animation.mycar.suv.wheels_deploy"];
    const retract = anims["animation.mycar.suv.wheels_retract"];
    for (const w of WHEELS) {
      expect(deploy.bones[w].rotation["1.0"]).toEqual(folded[w].rotation);
      expect(retract.bones[w].rotation["0.0"]).toEqual(folded[w].rotation);
      expect(retract.bones[w].rotation["1.0"]).toEqual([0, 0, 0]);
    }
  });

  it("emits the glow particle from every hover locator", () => {
    const locators = anims["animation.mycar.suv.hover_glow"].particle_effects[
      "0.0"
    ].map((e: { locator: string }) => e.locator);
    expect(locators.sort()).toEqual([
      "hover_fl",
      "hover_fr",
      "hover_rl",
      "hover_rr",
    ]);
  });

  it("selects glow, rear glass and sealed window visibility from gear and form", () => {
    expect(render.part_visibility).toEqual([
      { "*": true },
      { "glow_*": "!query.property('mycar:gear_down')" },
      { rear_glass: "query.property('mycar:form') != 'car'" },
      { windows_sealed: "query.property('mycar:form') == 'submarine'" },
    ]);
  });

  it("keeps the Resource Pack module and the Behavior Pack's dependency on the Resource Pack version (ADR 0015)", () => {
    const rp = read(`${RP}/manifest.json`);
    const bp = read("packs/mycar_bp/manifest.json");
    const dep = bp.dependencies.find(
      (d: { uuid?: string }) => d.uuid === rp.header.uuid,
    );
    // 0.1.25 first shows the props by scale instead of by form; an older cached
    // copy hides them while they fold away on surfacing.
    const [major, minor, patch] = rp.header.version;
    expect(major * 1e6 + minor * 1e3 + patch).toBeGreaterThanOrEqual(1025);
    expect(rp.modules[0].version).toEqual(rp.header.version);
    expect(dep.version).toEqual(rp.header.version);
  });
});

describe("Resource Pack banking (ADR 0026)", () => {
  const geo = read(`${RP}/models/entity/suv.geo.json`)["minecraft:geometry"][0];
  const root = geo.bones.find((b: { name: string }) => b.name === "root");

  // A positive z rotation lowers the model's +x side, which is the vehicle's
  // left (0022 folds the left wheels hub side down with +90), so a bank to the
  // right (positive) needs a negative z rotation.
  it("rolls the whole model about its length by mycar:bank", () => {
    expect(client.scripts.animate).toContain("bank");
    expect(client.animations.bank).toBe("animation.mycar.suv.bank");
    expect(anims["animation.mycar.suv.bank"].bones).toEqual({
      root: { rotation: [0, 0, "-query.property('mycar:bank')"] },
    });
  });

  it("rolls around a pivot inside the body rather than at the wheels' contact patch", () => {
    expect(root.pivot[0]).toBe(0);
    expect(root.pivot[2]).toBe(0);
    expect(root.pivot[1]).toBeGreaterThan(6);
  });
});

describe("Resource Pack sounds (ADR 0030)", () => {
  const defs = read(`${RP}/sounds/sound_definitions.json`).sound_definitions;
  const effectsOf = (anim: string) =>
    Object.values<{ effect: string }>(anims[anim].sound_effects).map(
      (k) => k.effect,
    );

  it("maps every sound effect to a definition whose files exist", () => {
    for (const event of Object.values<string>(client.sound_effects)) {
      expect(defs[event], event).toBeDefined();
      for (const sound of defs[event].sounds)
        expect(existsSync(`${RP}/${sound.name}.wav`), sound.name).toBe(true);
    }
  });

  const GROUND = "query.has_rider && query.property('mycar:form') == 'car'";

  /** The [lo, hi) range of query.ground_speed each level plays in, in level order. */
  function speedRanges(
    entries: Record<string, string>[],
    prefix: string,
    guard: string,
  ): [number, number][] {
    return entries.map((entry, level) => {
      const [name, condition] = defined(
        Object.entries(entry)[0],
        `level ${level}`,
      );
      expect(name).toBe(`${prefix}${level}`);
      let rest = condition;
      if (guard) {
        expect(rest.startsWith(guard), name).toBe(true);
        rest = rest.slice(guard.length).replace(/^ && /, "");
      }
      const lo = /query\.ground_speed >= ([\d.]+)/.exec(rest)?.[1];
      const hi = /query\.ground_speed < ([\d.]+)/.exec(rest)?.[1];
      return [lo ? Number(lo) : 0, hi ? Number(hi) : Number.POSITIVE_INFINITY];
    });
  }

  function expectContiguous(ranges: [number, number][]): void {
    expect(ranges[0]?.[0]).toBe(0);
    expect(ranges.at(-1)?.[1]).toBe(Number.POSITIVE_INFINITY);
    ranges.slice(1).forEach(([lo, hi], i) => {
      expect(lo).toBe(ranges[i]?.[1]);
      expect(lo).toBeLessThan(hi);
    });
  }

  it("rumbles the engine on the ground at a pitch that rises with the speed", () => {
    const levels = client.scripts.animate.filter(
      (a: unknown) =>
        typeof a === "object" &&
        a !== null &&
        (Object.keys(a)[0] ?? "").startsWith("engine_sound_"),
    );
    expect(levels.length).toBeGreaterThan(1);
    expectContiguous(speedRanges(levels, "engine_sound_", GROUND));
    levels.forEach((_: unknown, i: number) => {
      expect(effectsOf(client.animations[`engine_sound_${i}`])).toEqual([
        `engine_${i}`,
      ]);
    });
  });

  it("swells as the wheels fold, and rushes while hovering at a pitch that rises with the speed", () => {
    expect(effectsOf("animation.mycar.suv.wheels_deploy")).toEqual([
      "hover_start",
    ]);
    const levels = controller.states.hover.animations.filter(
      (a: unknown) => typeof a === "object" && a !== null,
    );
    expect(levels.length).toBeGreaterThan(1);
    expectContiguous(speedRanges(levels, "hover_sound_", ""));
    levels.forEach((_: unknown, i: number) => {
      expect(effectsOf(client.animations[`hover_sound_${i}`])).toEqual([
        `hover_${i}`,
      ]);
    });
  });

  // A loop shorter than its clip stacks copies; a longer one leaves gaps.
  it("loops each level animation exactly as long as its clip", () => {
    const seconds = (name: string) => {
      const wav = readFileSync(`${RP}/${name}.wav`);
      // A canonical PCM WAV: byte rate at offset 28, data size at offset 40.
      return wav.readUInt32LE(40) / wav.readUInt32LE(28);
    };
    for (const [short, id] of Object.entries<string>(client.animations)) {
      const anim = anims[id];
      if (!anim?.loop || !anim.sound_effects) continue;
      const [effect] = Object.values<{ effect: string }>(anim.sound_effects);
      const event = client.sound_effects[defined(effect, short).effect];
      const [sound] = defs[event].sounds;
      expect(anim.animation_length, short).toBeCloseTo(seconds(sound.name), 3);
    }
  });
});

describe("Resource Pack submarine visuals (ADR 0039)", () => {
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
    pivot: Vec3;
    cubes?: Cube[];
  }
  const geo = read(`${RP}/models/entity/suv.geo.json`)["minecraft:geometry"][0];
  const bones = new Map<string, Bone>(geo.bones.map((b: Bone) => [b.name, b]));
  const bone = (name: string) => defined(bones.get(name), name);
  const dive = anims["animation.mycar.suv.dive"];
  const submerged = anims["animation.mycar.suv.submerged"];
  const surface = anims["animation.mycar.suv.surface"];
  const REAR = ["rl", "rr"] as const;
  const TURNED = [
    ...REAR.map((s) => `wheel_${s}`),
    ...REAR.map((s) => `prop_${s}`),
  ];

  // Right-handed rotations in file coordinates, x first, then y, then z, as
  // Blockbench applies Bedrock rotations. With this, +y turns +z toward +x,
  // which is what the door test in model.test.ts pins from the game.
  function rotate(p: Vec3, [rx, ry, rz]: Vec3, about: Vec3): Vec3 {
    const r = Math.PI / 180;
    let [x, y, z] = [p[0] - about[0], p[1] - about[1], p[2] - about[2]];
    [y, z] = [
      y * Math.cos(rx * r) - z * Math.sin(rx * r),
      y * Math.sin(rx * r) + z * Math.cos(rx * r),
    ];
    [x, z] = [
      x * Math.cos(ry * r) + z * Math.sin(ry * r),
      -x * Math.sin(ry * r) + z * Math.cos(ry * r),
    ];
    [x, y] = [
      x * Math.cos(rz * r) - y * Math.sin(rz * r),
      x * Math.sin(rz * r) + y * Math.cos(rz * r),
    ];
    return [x + about[0], y + about[1], z + about[2]];
  }

  /** Points on a grid through each cube of the bone, in bone-local file coordinates. */
  function samples(name: string, steps = 4): Vec3[] {
    const out: Vec3[] = [];
    for (const c of bone(name).cubes ?? [])
      for (let i = 0; i <= steps; i++)
        for (let j = 0; j <= steps; j++)
          for (let k = 0; k <= steps; k++) {
            const p: Vec3 = [
              c.origin[0] + (c.size[0] * i) / steps,
              c.origin[1] + (c.size[1] * j) / steps,
              c.origin[2] + (c.size[2] * k) / steps,
            ];
            out.push(
              c.rotation ? rotate(p, c.rotation, defined(c.pivot, name)) : p,
            );
          }
    return out;
  }

  /** The bone's points in the submerged pose: turned about its pivot, then moved. */
  function posed(name: string): Vec3[] {
    const { rotation, position } = submerged.bones[name];
    const yaw: Vec3 = [rotation[0], rotation[1], 0];
    return samples(name).map((p) => {
      const q = rotate(p, yaw, bone(name).pivot);
      return [q[0] + position[0], q[1] + position[1], q[2] + position[2]];
    });
  }

  function insideCube(p: Vec3, c: Cube): boolean {
    const q = c.rotation
      ? // Undo the cube's rotation: negate the angles and reverse the order.
        rotateBack(p, c.rotation, defined(c.pivot, "cube pivot"))
      : p;
    const eps = 1e-6;
    return [0, 1, 2].every(
      (i) =>
        (c.origin[i] ?? 0) + eps < (q[i] ?? 0) &&
        (q[i] ?? 0) < (c.origin[i] ?? 0) + (c.size[i] ?? 0) - eps,
    );
  }

  function rotateBack(p: Vec3, [rx, ry, rz]: Vec3, about: Vec3): Vec3 {
    const q = rotate(p, [0, 0, -rz], about);
    return rotate(rotate(q, [0, -ry, 0], about), [-rx, 0, 0], about);
  }

  const descendsFromBody = (b: Bone): boolean =>
    b.name === "body" || (!!b.parent && descendsFromBody(bone(b.parent)));
  const bodyCubes = [...bones.values()]
    .filter(descendsFromBody)
    .flatMap((b) => b.cubes ?? []);

  it("registers the three submarine animations", () => {
    for (const name of ["dive", "submerged", "surface"]) {
      expect(client.animations[name]).toBe(`animation.mycar.suv.${name}`);
      expect(anims[client.animations[name]]).toBeDefined();
    }
  });

  it("serializes diving and surfacing with the gear transforms through ground", () => {
    const s = controller.states;
    expect(s.ground.transitions).toEqual([
      { dive: "query.property('mycar:form') == 'submarine'" },
      { deploy: "!query.property('mycar:gear_down')" },
    ]);
    expect(s.dive).toEqual({
      animations: ["dive"],
      transitions: [{ submarine: "query.all_animations_finished" }],
    });
    expect(s.submarine).toEqual({
      animations: ["submerged"],
      transitions: [{ surface: "query.property('mycar:form') != 'submarine'" }],
    });
    expect(s.surface).toEqual({
      animations: ["surface"],
      transitions: [{ ground: "query.all_animations_finished" }],
    });
    expect(s.deploy.transitions).toEqual([
      { hover: "query.all_animations_finished" },
    ]);
    expect(s.retract.transitions).toEqual([
      { ground: "query.all_animations_finished" },
    ]);
    for (const [name, state] of Object.entries<{
      animations: unknown[];
      blend_transition?: number;
    }>(s)) {
      if (name !== "ground") expect(state.animations).not.toContain("wheels");
      expect(state.blend_transition ?? 0).toBe(0);
    }
  });

  const targets = (state: { transitions?: Record<string, string>[] }) =>
    (state.transitions ?? []).flatMap((t) => Object.keys(t));

  it("sends every controller transition to a state that exists", () => {
    for (const [name, state] of Object.entries<{
      transitions?: Record<string, string>[];
    }>(controller.states))
      for (const target of targets(state))
        expect(controller.states[target], `${name} -> ${target}`).toBeDefined();
  });

  it("can return to ground from every controller state", () => {
    for (const start of Object.keys(controller.states)) {
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length > 0) {
        const next = targets(controller.states[queue.shift() ?? ""]);
        for (const t of next.filter((t) => !seen.has(t))) {
          seen.add(t);
          queue.push(t);
        }
      }
      expect(seen.has("ground"), start).toBe(true);
    }
  });

  it("animates only bones that exist in the model", () => {
    for (const [id, anim] of Object.entries<{ bones?: object }>(anims))
      for (const name of Object.keys(anim.bones ?? {}))
        expect(bones.has(name), `${id}: ${name}`).toBe(true);
  });

  it("times the dive and surface like the gear transforms and loops the submerged pose", () => {
    // Like wheels_deploy, dive ends without holding its last frame: the
    // submarine state's looping pose takes over on the next frame.
    expect(dive.animation_length).toBe(1);
    expect(dive.loop ?? false).toBe(false);
    expect(surface.animation_length).toBe(1);
    expect(surface.loop ?? false).toBe(false);
    expect(submerged.loop).toBe(true);
    for (const anim of [dive, submerged, surface])
      expect(Object.keys(anim.bones).sort()).toEqual([...TURNED].sort());
  });

  it("turns each rear hub to face the rear, with the prop behind its wheel", () => {
    // The front is -z (ADR 0009), so the rear is +z. Derive the turn from the
    // model instead of trusting a sign: the hub cap, and the prop on it, must
    // end up at larger z than the wheel pivot.
    for (const side of REAR) {
      const pivotZ = bone(`wheel_${side}`).pivot[2];
      const props = posed(`prop_${side}`);
      const centroidZ = props.reduce((sum, p) => sum + p[2], 0) / props.length;
      expect(centroidZ, `prop_${side}`).toBeGreaterThan(pivotZ + 2);
    }
  });

  it("moves each turned wheel and prop outward until they clear the body", () => {
    for (const name of TURNED) {
      const outward = Math.sign(bone(name).pivot[0]);
      expect(Math.sign(submerged.bones[name].position[0]), name).toBe(outward);
      const clash = posed(name).find((p) =>
        bodyCubes.some((c) => insideCube(p, c)),
      );
      expect(clash, name).toBeUndefined();
    }
  });

  it("slides the rear wheels and props out, then turns them, and reverses that on surfacing", () => {
    // Sliding out first keeps the turning tire out of the body: at any angle
    // between 0 and 90 degrees with no offset, the tire cuts into the door.
    for (const name of TURNED) {
      const { rotation, position } = submerged.bones[name];
      const yaw: Vec3 = [0, rotation[1], 0];
      expect(dive.bones[name].position).toEqual({
        "0.0": [0, 0, 0],
        "0.5": position,
        "1.0": position,
      });
      expect(dive.bones[name].rotation).toEqual({
        "0.0": [0, 0, 0],
        "0.5": [0, 0, 0],
        "1.0": yaw,
      });
      expect(surface.bones[name].rotation).toEqual({
        "0.0": yaw,
        "0.5": [0, 0, 0],
        "1.0": [0, 0, 0],
      });
      expect(surface.bones[name].position).toEqual({
        "0.0": position,
        "0.5": position,
        "1.0": [0, 0, 0],
      });
    }
    for (const side of REAR) {
      const wheel = submerged.bones[`wheel_${side}`];
      expect(wheel.rotation, side).toEqual([0, wheel.rotation[1], 0]);
      // Z is the turned axle: one block advances the propeller by 360 degrees.
      expect(submerged.bones[`prop_${side}`]).toEqual({
        rotation: [0, wheel.rotation[1], "query.modified_distance_moved * 360"],
        position: wheel.position,
        scale: 1,
      });
      expect(dive.bones[`prop_${side}`].scale).toEqual({
        "0.0": 0,
        "0.5": 0,
        "1.0": 1,
      });
      // The props are gone before surface hands over to ground and then
      // deploy, so they fold away before the wheels fold for hover.
      expect(surface.bones[`prop_${side}`].scale).toEqual({
        "0.0": 1,
        "0.5": 0,
        "1.0": 0,
      });
    }
    expect(submerged.bones.wheel_rl.rotation[1]).toBe(
      -submerged.bones.wheel_rr.rotation[1],
    );
  });

  // The props have no visibility rule, because one tied to the form would hide
  // them the moment the form leaves submarine, before surface folds them. So
  // every other state pins them at scale 0 instead. That includes deploy,
  // hover and retract: the form flips to submarine while retract still plays.
  it("holds the props at scale zero in every state outside the submarine ones", () => {
    const submarineStates = ["dive", "submarine", "surface"];
    for (const [name, state] of Object.entries<{
      animations: (string | object)[];
    }>(controller.states)) {
      if (submarineStates.includes(name)) continue;
      const pinned = state.animations.some((entry) => {
        if (typeof entry !== "string") return false;
        const animBones = anims[client.animations[entry]]?.bones ?? {};
        return REAR.every((side) => animBones[`prop_${side}`]?.scale === 0);
      });
      expect(pinned, name).toBe(true);
    }
  });
});
