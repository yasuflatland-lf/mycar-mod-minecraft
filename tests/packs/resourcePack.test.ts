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
    // Split so that a repository-wide search for the old name finds nothing.
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

  it("selects glow, rear glass and submarine visibility from gear and form", () => {
    expect(render.part_visibility).toEqual([
      { "*": true },
      { "glow_*": "!query.property('mycar:gear_down')" },
      { rear_glass: "query.property('mycar:form') != 'car'" },
      { windows_sealed: "query.property('mycar:form') == 'submarine'" },
      { "prop_*": "query.property('mycar:form') == 'submarine'" },
    ]);
  });

  it("keeps the Resource Pack module and the Behavior Pack's dependency on the Resource Pack version (ADR 0015)", () => {
    const rp = read(`${RP}/manifest.json`);
    const bp = read("packs/mycar_bp/manifest.json");
    const dep = bp.dependencies.find(
      (d: { uuid?: string }) => d.uuid === rp.header.uuid,
    );
    // 0.1.25 first ships the sonar (0040); an older cached copy lacks it.
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

  /** The sound effects an animate entry plays: a short name, or { name: condition }. */
  const effectsOfEntry = (entry: unknown): string[] => {
    const short =
      typeof entry === "string" ? entry : Object.keys(entry as object)[0];
    const anim = anims[client.animations[short ?? ""]];
    return anim?.sound_effects ? effectsOf(client.animations[short ?? ""]) : [];
  };

  it("loops the sonar only in the submarine form while someone rides (ADR 0040)", () => {
    expect(controller.states.submarine.animations).toContainEqual({
      submarine_sound: "query.has_rider",
    });
    expect(effectsOf(client.animations.submarine_sound)).toEqual(["sonar"]);
    expect(anims[client.animations.submarine_sound].loop).toBe(true);
    for (const [state, def] of Object.entries<{ animations: unknown[] }>(
      controller.states,
    )) {
      if (state === "submarine") continue;
      expect(def.animations.flatMap(effectsOfEntry), state).not.toContain(
        "sonar",
      );
    }
    expect(client.scripts.animate.flatMap(effectsOfEntry)).not.toContain(
      "sonar",
    );
  });

  it("starts the sonar loop with a ping that fades before the loop ends (ADR 0040)", () => {
    const wav = readFileSync(`${RP}/sounds/mycar/sonar.wav`);
    const rate = wav.readUInt32LE(24);
    const samples = new Int16Array(
      wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length),
    );
    // Goertzel magnitude of the ping's pitch (SONAR_PING_HZ in tools/gen_sounds.py) over a window.
    const ping = (fromS: number, toS: number) => {
      const k = 2 * Math.cos((2 * Math.PI * 1400) / rate);
      let a = 0;
      let b = 0;
      const window = samples.subarray(fromS * rate, toS * rate);
      for (const x of window) [a, b] = [x + k * a - b, a];
      return Math.sqrt(a * a + b * b - k * a * b) / window.length;
    };
    expect(ping(0, 0.25)).toBeGreaterThan(20 * ping(3.5, 4));
  });

  // A loop shorter than its clip stacks copies; a longer one leaves gaps.
  it("loops each sound animation exactly as long as its clip", () => {
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
      animations: ["submerged", { submarine_sound: "query.has_rider" }],
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

  it("turns only the rear wheels and props backward, then reverses the one-second dive", () => {
    const dive = anims["animation.mycar.suv.dive"];
    const submerged = anims["animation.mycar.suv.submerged"];
    const surface = anims["animation.mycar.suv.surface"];
    expect(dive.animation_length).toBe(1);
    expect(dive.loop).toBe("hold_on_last_frame");
    expect(surface.animation_length).toBe(1);
    expect(surface.loop ?? false).toBe(false);
    expect(submerged.loop).toBe(true);
    for (const anim of [dive, submerged, surface]) {
      expect(Object.keys(anim.bones).sort()).toEqual([
        "prop_rl",
        "prop_rr",
        "wheel_rl",
        "wheel_rr",
      ]);
    }
    // The generated model's left hub points +x. Bedrock animation +y turns it
    // toward +z (the rear); the right hub needs the opposite turn.
    for (const [side, yaw] of [
      ["rl", 90],
      ["rr", -90],
    ] as const) {
      for (const prefix of ["wheel", "prop"]) {
        const name = `${prefix}_${side}`;
        expect(dive.bones[name].rotation).toEqual({
          "0.0": [0, 0, 0],
          "1.0": [0, yaw, 0],
        });
        expect(surface.bones[name].rotation).toEqual({
          "0.0": [0, yaw, 0],
          "1.0": [0, 0, 0],
        });
      }
      expect(submerged.bones[`wheel_${side}`].rotation).toEqual([0, yaw, 0]);
      // Z is the turned axle: one block advances the propeller by 360 degrees.
      expect(submerged.bones[`prop_${side}`]).toEqual({
        rotation: [0, yaw, "query.modified_distance_moved * 360"],
        scale: 1,
      });
      expect(dive.bones[`prop_${side}`].scale).toEqual({ "0.0": 0, "1.0": 1 });
      expect(surface.bones[`prop_${side}`].scale).toEqual({
        "0.0": 1,
        "1.0": 0,
      });
    }
  });

  it("keeps props at scale zero in every ground and flight pose", () => {
    for (const name of [
      "wheels",
      "wheels_deploy",
      "wheels_folded",
      "wheels_retract",
    ]) {
      const bones = anims[`animation.mycar.suv.${name}`].bones;
      for (const side of ["rl", "rr"])
        expect(bones[`prop_${side}`]).toEqual({ scale: 0 });
    }
  });
});
