import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/vehicle/paint";
import {
  HEADLIGHTS_PROPERTY,
  PAINT_VARIANT,
  paintEvent,
  VEHICLE_FAMILY,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const RP = "packs/yasu_ride_rp";
const entity = read("packs/yasu_ride_bp/entities/yasu_ride/sportsboat.se.json")[
  "minecraft:entity"
];
const c = entity.components;
const client = read(`${RP}/entity/yasu_ride/sportsboat.ce.json`)[
  "minecraft:client_entity"
].description;
const controller = read(`${RP}/render_controllers/yasu_ride/sportsboat.rc.json`)
  .render_controllers["controller.render.yasu_ride.sportsboat"];
const geometry = read(`${RP}/models/entity/yasu_ride/sportsboat.geo.json`)[
  "minecraft:geometry"
][0];

describe("sports boat Behavior Pack entity (ADR 0051)", () => {
  it("has a collision box 2.2 wide and 1.2 high", () => {
    expect(c["minecraft:collision_box"]).toEqual({ width: 2.2, height: 1.2 });
  });

  it("has three hit boxes along the 6-block hull, since hits outside the square collision box miss", () => {
    expect(c["minecraft:custom_hit_test"].hitboxes).toEqual(
      [-1.6, 0, 1.6].map((z) => ({
        width: 2.2,
        height: 1.4,
        pivot: [0, 0.7, z],
      })),
    );
  });

  it("floats with minecraft:buoyant, gravity on and no waves", () => {
    expect(c["minecraft:buoyant"]).toEqual({
      base_buoyancy: 1.0,
      apply_gravity: true,
      simulate_waves: false,
      big_wave_probability: 0,
      liquid_blocks: ["minecraft:water", "minecraft:flowing_water"],
    });
  });

  it("has four seats at the SUV's x and z, 0.52 up, with the driver in seat 0", () => {
    const rideable = c["minecraft:rideable"];
    expect(rideable.controlling_seat).toBe(0);
    expect(rideable.family_types).toEqual(["player"]);
    expect(rideable.crouching_skip_interact).toBe(true);
    expect(
      rideable.seats.map((s: { position: number[] }) => s.position),
    ).toEqual([
      [-0.38, 0.52, 0.35],
      [0.38, 0.52, 0.35],
      [-0.38, 0.52, -0.8],
      [0.38, 0.52, -0.8],
    ]);
    expect(rideable.seats[0].lock_rider_rotation).toBe(90);
  });

  it("is in the vehicle family, so the script's family query finds it", () => {
    expect(c["minecraft:type_family"].family).toEqual([
      VEHICLE_FAMILY,
      "inanimate",
    ]);
  });

  it("takes no damage (ADR 0006)", () => {
    expect(c["minecraft:damage_sensor"].triggers).toEqual({
      cause: "all",
      deals_damage: "no",
    });
  });

  it("each paint event sets that paint's variant and drops the other paints", () => {
    expect(c["minecraft:variant"].value).toBe(0);
    expect(Object.keys(entity.component_groups).sort()).toEqual(
      [
        ...PAINTS.map((p) => `yasu_ride:paint_${p}`),
        "yasu_ride:docked",
        "yasu_ride:undocked",
      ].sort(),
    );
    expect(Object.keys(entity.events).sort()).toEqual(
      [...PAINTS.map(paintEvent), "yasu_ride:dock", "yasu_ride:undock"].sort(),
    );
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

  it("defaults to undocked with headlights off and level attitude, syncing only the visual properties", () => {
    expect(entity.description.properties).toEqual({
      "yasu_ride:docked": {
        type: "bool",
        default: false,
        client_sync: false,
      },
      [HEADLIGHTS_PROPERTY]: {
        type: "bool",
        default: false,
        client_sync: true,
      },
      "yasu_ride:trim": {
        type: "float",
        range: [0, 7],
        default: 0,
        client_sync: true,
      },
      "yasu_ride:roll": {
        type: "float",
        range: [-20, 20],
        default: 0,
        client_sync: true,
      },
    });
  });

  it("disables collision and gravity on dock and restores physics on undock (ADR 0063)", () => {
    expect(c["minecraft:physics"]).toEqual({});
    expect(entity.component_groups["yasu_ride:docked"]).toEqual({
      "minecraft:physics": { has_collision: false, has_gravity: false },
    });
    // Removing a group that overrides a base component removes the component (ADR 0063).
    expect(entity.component_groups["yasu_ride:undocked"]).toEqual({
      "minecraft:physics": {},
    });
    expect(entity.events["yasu_ride:dock"]).toEqual({
      remove: { component_groups: ["yasu_ride:undocked"] },
      add: { component_groups: ["yasu_ride:docked"] },
    });
    expect(entity.events["yasu_ride:undock"]).toEqual({
      remove: { component_groups: ["yasu_ride:docked"] },
      add: { component_groups: ["yasu_ride:undocked"] },
    });
  });

  it("is crafted on a crafting table from an oak boat and iron ingots, unlocked from the start (ADR 0008)", () => {
    const item = read(
      "packs/yasu_ride_bp/items/yasu_ride/sportsboat_item.item.json",
    )["minecraft:item"];
    expect(item.description.identifier).toBe("yasu_ride:sportsboat_item");
    const recipe = read(
      "packs/yasu_ride_bp/recipes/yasu_ride/sportsboat_item.recipe.json",
    )["minecraft:recipe_shaped"];
    expect(recipe.tags).toEqual(["crafting_table"]);
    expect(recipe.unlock).toEqual({ context: "AlwaysUnlocked" });
    expect(recipe.pattern).toEqual(["IBI", "III"]);
    expect(recipe.key).toEqual({
      I: { item: "minecraft:iron_ingot" },
      B: { item: "minecraft:oak_boat" },
    });
    expect(recipe.result).toEqual({
      item: "yasu_ride:sportsboat_item",
      count: 1,
    });
  });
});

describe("sports boat attitude and wake (ADR 0059)", () => {
  const animations = read(
    `${RP}/animations/yasu_ride/sportsboat.anim.json`,
  ).animations;

  // In game a positive x rotation of the root lowered the bow, so the trim is negated (ADR 0061).
  it("turns the root bone by minus the trim on x and minus the roll on z in one always-on animation", () => {
    expect(client.animations.attitude).toBe(
      "animation.yasu_ride.sportsboat.attitude",
    );
    expect(client.scripts.animate).toContain("attitude");
    expect(animations["animation.yasu_ride.sportsboat.attitude"].bones).toEqual(
      {
        root: {
          rotation: [
            "-query.property('yasu_ride:trim')",
            0,
            "-query.property('yasu_ride:roll')",
          ],
        },
      },
    );
  });

  it("puts the root pivot in the aft third at the waterline", () => {
    const root = geometry.bones.find(
      (b: { name: string }) => b.name === "root",
    );
    expect(root.pivot).toEqual([0, 7, 20]);
  });

  it("emits bubbles and foam from both jet nozzles while ridden faster than 2 blocks a second", () => {
    expect(client.scripts.animate).toContainEqual({
      wake: "query.has_rider && query.ground_speed > 2",
    });
    const effects = Object.values(
      animations["animation.yasu_ride.sportsboat.wake"].particle_effects,
    ).flat() as { effect: string; locator: string }[];
    const body = geometry.bones.find(
      (b: { name: string }) => b.name === "body",
    );
    for (const effect of ["jet_bubbles", "jet_foam"]) {
      const particle = read(
        `${RP}/particles/yasu_ride/${effect}.particle.json`,
      ).particle_effect;
      expect(client.particle_effects[effect]).toBe(
        particle.description.identifier,
      );
      expect(
        effects.filter((e) => e.effect === effect).map((e) => e.locator),
      ).toEqual(["jet_left", "jet_right"]);
    }
    expect(Object.keys(body.locators).sort()).toEqual([
      "jet_left",
      "jet_right",
    ]);
  });
});

describe("sports boat Resource Pack (ADR 0051)", () => {
  it("the client entity draws the sports boat geometry with the sports boat render controller", () => {
    expect(geometry.description.identifier).toBe(
      "geometry.yasu_ride.sportsboat",
    );
    expect(client.geometry).toEqual({
      default: "geometry.yasu_ride.sportsboat",
    });
    expect(client.render_controllers).toEqual([
      "controller.render.yasu_ride.sportsboat",
    ]);
  });

  it("picks one of 16 paint textures by variant, black (variant 0) as sportsboat.png", () => {
    expect(controller.textures).toEqual(["Array.paints[query.variant]"]);
    const slots: string[] = controller.arrays.textures["Array.paints"];
    expect(slots).toHaveLength(PAINTS.length);
    for (const paint of PAINTS) {
      const key = slots[PAINT_VARIANT[paint]]?.replace("Texture.", "") ?? "";
      const path = client.textures[key];
      expect(path, paint).toBe(
        paint === "khaki"
          ? "textures/entity/yasu_ride/sportsboat"
          : `textures/entity/yasu_ride/sportsboat_${paint}`,
      );
      expect(existsSync(`${RP}/${path}.png`), path).toBe(true);
    }
  });

  it("draws the windshield with the alpha-blended glass material", () => {
    expect(controller.materials).toContainEqual({
      windshield: "Material.glass",
    });
    expect(client.materials.glass).toBe("entity_alphablend");
  });

  it("names the bones root, body, headlights, and windshield (ADR 0009)", () => {
    expect(geometry.bones.map((b: { name: string }) => b.name)).toEqual([
      "root",
      "body",
      "headlights",
      "windshield",
    ]);
  });
});

describe("sports boat engine sound (ADR 0060)", () => {
  const defs = read(`${RP}/sounds/sound_definitions.json`).sound_definitions;
  const animations = read(
    `${RP}/animations/yasu_ride/sportsboat.anim.json`,
  ).animations;
  const levels: Record<string, string>[] = client.scripts.animate.filter(
    (a: unknown) =>
      typeof a === "object" &&
      a !== null &&
      (Object.keys(a)[0] ?? "").startsWith("engine_sound_"),
  );
  const GUARD = "query.has_rider";

  it("plays one of eight levels by speed while ridden, over contiguous ranges from rest upward", () => {
    expect(levels).toHaveLength(8);
    let previous = 0;
    levels.forEach((entry, level) => {
      const [name, condition] = Object.entries(entry)[0] ?? ["", ""];
      expect(name).toBe(`engine_sound_${level}`);
      expect(condition.startsWith(GUARD), name).toBe(true);
      const lo = /query\.ground_speed >= ([\d.]+)/.exec(condition)?.[1];
      const hi = /query\.ground_speed < ([\d.]+)/.exec(condition)?.[1];
      expect(lo ? Number(lo) : 0).toBe(previous);
      previous = hi ? Number(hi) : Number.POSITIVE_INFINITY;
      if (level < levels.length - 1)
        expect(previous, name).toBeLessThan(Number.POSITIVE_INFINITY);
    });
    expect(previous).toBe(Number.POSITIVE_INFINITY);
  });

  it("loops each level's own clip for exactly its length, louder as the revs rise", () => {
    let volume = 0;
    levels.forEach((_, level) => {
      const anim = animations[client.animations[`engine_sound_${level}`] ?? ""];
      const [effect] = Object.values<{ effect: string }>(anim.sound_effects);
      expect(effect?.effect).toBe(`engine_${level}`);
      const event = client.sound_effects[`engine_${level}`];
      expect(event).toBe(`yasu_ride.boat_engine_${level}`);
      const [sound] = defs[event].sounds;
      const path = `${RP}/${sound.name}.wav`;
      expect(existsSync(path), path).toBe(true);
      const wav = readFileSync(path);
      // A canonical PCM WAV: byte rate at offset 28, data size at offset 40
      expect(anim.loop).toBe(true);
      expect(anim.animation_length).toBeCloseTo(
        wav.readUInt32LE(40) / wav.readUInt32LE(28),
        3,
      );
      expect(sound.volume).toBeGreaterThan(volume);
      volume = sound.volume;
    });
  });
});
