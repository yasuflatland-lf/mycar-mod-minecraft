import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const RP = "packs/mycar_rp";
const client = read(`${RP}/entity/suv.entity.json`)["minecraft:client_entity"]
  .description;
const anims = read(`${RP}/animations/suv.animation.json`).animations;
const controller = read(
  `${RP}/animation_controllers/suv.animation_controllers.json`,
).animation_controllers["controller.animation.mycar.suv.flight"];
const render = read(`${RP}/render_controllers/suv.render_controllers.json`)
  .render_controllers["controller.render.mycar.suv"];
const particle = read(`${RP}/particles/hover_glow.json`).particle_effect;
const WHEELS = ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"];

describe("Resource Pack flight visuals (ADR 0022)", () => {
  it("runs the flight controller and the custom render controller with an emissive material", () => {
    expect(client.scripts.animate).toContain("flight");
    expect(client.animations.flight).toBe(
      "controller.animation.mycar.suv.flight",
    );
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
    expect(s.hover.animations).toEqual(["wheels_folded", "hover_glow"]);
    expect(s.retract.animations).toEqual(["wheels_retract"]);
    for (const state of [s.ground, s.hover]) {
      expect(JSON.stringify(state.transitions)).toContain(
        "query.property('mycar:flight')",
      );
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

  it("shows the glow bones only while the vehicle is not on the ground", () => {
    expect(render.part_visibility).toEqual([
      { "*": true },
      { "glow_*": "query.property('mycar:flight') != 'ground'" },
    ]);
  });

  it("bumps the Resource Pack version and the Behavior Pack's dependency together (ADR 0015)", () => {
    const rp = read(`${RP}/manifest.json`);
    const bp = read("packs/mycar_bp/manifest.json");
    const dep = bp.dependencies.find(
      (d: { uuid?: string }) => d.uuid === rp.header.uuid,
    );
    expect(rp.header.version).toEqual([0, 1, 6]);
    expect(rp.modules[0].version).toEqual(rp.header.version);
    expect(dep.version).toEqual(rp.header.version);
  });
});
