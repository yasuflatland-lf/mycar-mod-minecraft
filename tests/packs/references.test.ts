// Every name one pack file uses must be defined by another, or the game drops
// it silently: a missing geometry or texture draws nothing, and a missing lang
// key shows the raw key. These checks walk every file so new content is
// covered without a new test.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VEHICLE_KINDS } from "../../src/domain/vehicle/kind";
import {
  ENTITY_TYPE,
  HEADLIGHT_SWITCH_TYPE,
  ITEM_TYPE,
  VEHICLE_FAMILY,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";
import { type Json, jsonFiles } from "../support/packFiles";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RP = join(REPO_ROOT, "packs/yasu_ride_rp");
const BP = join(REPO_ROOT, "packs/yasu_ride_bp");
// Textures the game ships, so the pack has no PNG for them.
const VANILLA_TEXTURES = new Set(["textures/particle/particles"]);
const LOCALES = ["en_US", "ja_JP"];

function definedKeys(dir: string, key: string): Set<string> {
  return new Set(
    jsonFiles(join(RP, dir)).flatMap((file) =>
      Object.keys((file[key] as Json | undefined) ?? {}),
    ),
  );
}

/** A render controller or animate entry is a name or { name: condition }. */
function nameOf(entry: string | Json): string {
  return typeof entry === "string" ? entry : (Object.keys(entry)[0] ?? "");
}

function textureMissing(path: string): boolean {
  return (
    !VANILLA_TEXTURES.has(path) &&
    !existsSync(join(RP, `${path}.png`)) &&
    !existsSync(join(RP, `${path}.tga`))
  );
}

interface ClientEntity {
  identifier: string;
  geometry?: Record<string, string>;
  animations?: Record<string, string>;
  textures?: Record<string, string>;
  render_controllers?: (string | Json)[];
}

const clientEntities: ClientEntity[] = jsonFiles(join(RP, "entity")).map(
  (f) =>
    (f["minecraft:client_entity"] as { description: ClientEntity }).description,
);
const geometries = new Set(
  jsonFiles(join(RP, "models")).flatMap((f) =>
    (
      (f["minecraft:geometry"] as { description: { identifier: string } }[]) ??
      []
    ).map((g) => g.description.identifier),
  ),
);
const animations = new Set([
  ...definedKeys("animations", "animations"),
  ...definedKeys("animation_controllers", "animation_controllers"),
]);
const renderControllers = new Set([
  // Bedrock supplies this controller without a pack definition.
  "controller.render.default",
  ...definedKeys("render_controllers", "render_controllers"),
]);
const itemTextures = (
  JSON.parse(readFileSync(join(RP, "textures/item_texture.json"), "utf8")) as {
    texture_data: Record<string, { textures: string | string[] }>;
  }
).texture_data;
interface BpEntity {
  description: { identifier: string };
  components?: { "minecraft:type_family"?: { family?: string[] } };
}

const bpEntities: BpEntity[] = jsonFiles(join(BP, "entities")).map(
  (f) => f["minecraft:entity"] as BpEntity,
);
const bpEntityIds = bpEntities.map((e) => e.description.identifier);
const bpItems = jsonFiles(join(BP, "items")).map(
  (f) =>
    f["minecraft:item"] as {
      description: { identifier: string };
      components: { "minecraft:icon"?: string | { texture?: string } };
    },
);
const lang = (locale: string): Set<string> =>
  new Set(
    readFileSync(join(RP, `texts/${locale}.lang`), "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.startsWith("##"))
      .map((line) => line.slice(0, line.indexOf("="))),
  );

describe("Resource Pack and Behavior Pack references", () => {
  it("finds the content to check", () => {
    expect(clientEntities.length).toBeGreaterThan(0);
    expect(bpEntityIds.length).toBeGreaterThan(0);
    expect(bpItems.length).toBeGreaterThan(0);
  });

  it("every client entity names geometry, animations, and render controllers the pack defines", () => {
    for (const entity of clientEntities) {
      for (const g of Object.values(entity.geometry ?? {}))
        expect(geometries, `${entity.identifier}: ${g}`).toContain(g);
      for (const a of Object.values(entity.animations ?? {}))
        expect(animations, `${entity.identifier}: ${a}`).toContain(a);
      for (const r of entity.render_controllers ?? [])
        expect(
          renderControllers,
          `${entity.identifier}: ${nameOf(r)}`,
        ).toContain(nameOf(r));
    }
  });

  it("every texture a client entity, item_texture.json, or particle names has an image", () => {
    const paths = [
      ...clientEntities.flatMap((e) => Object.values(e.textures ?? {})),
      ...Object.values(itemTextures).flatMap((t) => t.textures),
      ...jsonFiles(join(RP, "particles")).map(
        (f) =>
          (
            f.particle_effect as {
              description: { basic_render_parameters: { texture: string } };
            }
          ).description.basic_render_parameters.texture,
      ),
    ];
    expect(paths.filter(textureMissing)).toEqual([]);
  });

  it("every item icon is a key in item_texture.json", () => {
    for (const item of bpItems) {
      const icon = item.components["minecraft:icon"];
      const key = typeof icon === "string" ? icon : icon?.texture;
      expect(Object.keys(itemTextures), item.description.identifier).toContain(
        key,
      );
    }
  });

  it("every entity and item has a name in each locale", () => {
    const keys = [
      ...bpEntityIds.map((id) => `entity.${id}.name`),
      ...bpItems.map((i) => `item.${i.description.identifier}.name`),
    ];
    for (const locale of LOCALES) {
      const defined = lang(locale);
      expect(
        keys.filter((k) => !defined.has(k)),
        locale,
      ).toEqual([]);
    }
  });

  it("each Behavior Pack entity has a client entity with the same identifier", () => {
    expect(clientEntities.map((e) => e.identifier).sort()).toEqual(
      [...bpEntityIds].sort(),
    );
  });

  it("defines the identifiers the script uses", () => {
    expect(bpEntityIds).toEqual(
      expect.arrayContaining(Object.values(ENTITY_TYPE)),
    );
    expect(bpItems.map((i) => i.description.identifier)).toEqual(
      expect.arrayContaining([
        ...Object.values(ITEM_TYPE),
        HEADLIGHT_SWITCH_TYPE,
      ]),
    );
  });

  // The adapter finds vehicles by this family and skips an entity without it
  // silently, so the vehicle would never be driven.
  it("every vehicle entity lists the vehicle family", () => {
    for (const kind of VEHICLE_KINDS) {
      const entity = bpEntities.find(
        (e) => e.description.identifier === ENTITY_TYPE[kind],
      );
      expect(
        entity?.components?.["minecraft:type_family"]?.family,
        kind,
      ).toContain(VEHICLE_FAMILY);
    }
  });
});
