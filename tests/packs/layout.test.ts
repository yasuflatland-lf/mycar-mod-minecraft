import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Json, jsonFileEntries, packFiles } from "../support/packFiles";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKS = [
  {
    folder: "yasu_ride_bp",
    namespace: "yasu_ride",
    resource: false,
  },
  {
    folder: "yasu_ride_rp",
    namespace: "yasu_ride",
    resource: true,
  },
  {
    folder: "yasu_ride_test_bp",
    namespace: "yasu_ride_test",
    resource: false,
  },
];
const MAX_PATH_LENGTH = 80;
const NAMESPACES = new Set(PACKS.map((pack) => pack.namespace));
// Bedrock looks up these files at fixed paths rather than content paths (ADR 0047).
const ENGINE_FIXED_FILES = new Set([
  "manifest.json",
  "texts/languages.json",
  "textures/item_texture.json",
  "textures/terrain_texture.json",
  "textures/flipbook_textures.json",
  "sounds/sound_definitions.json",
  "sounds.json",
  "pack_icon.png",
]);

interface Definition {
  kind: string;
  identifier: string;
  path: string;
  dotted: boolean;
}

function definitions(
  path: string,
  json: Json,
  resource: boolean,
): Definition[] {
  const found: Definition[] = [];
  const addDescription = (kind: string, value: unknown, dotted = false) => {
    const definition = value as { description: { identifier: string } };
    found.push({
      kind,
      identifier: definition.description.identifier,
      path,
      dotted,
    });
  };
  for (const [key, value] of Object.entries(json)) {
    if (resource) {
      if (key === "minecraft:client_entity" || key === "particle_effect") {
        addDescription(key, value);
      } else if (key === "minecraft:geometry") {
        for (const geometry of value as unknown[]) {
          addDescription(key, geometry, true);
        }
      } else if (
        key === "animations" ||
        key === "animation_controllers" ||
        key === "render_controllers"
      ) {
        for (const identifier of Object.keys(value as Json)) {
          found.push({ kind: key, identifier, path, dotted: true });
        }
      }
    } else if (
      key === "minecraft:entity" ||
      key === "minecraft:item" ||
      key === "minecraft:block"
    ) {
      addDescription(key, value);
    } else if (key.startsWith("minecraft:recipe_")) {
      // Recipe variants share one identifier registry in the game.
      addDescription("recipe", value);
    }
  }
  return found;
}

describe.each(PACKS)("$folder pack layout and identifiers", (pack) => {
  const root = join(REPO_ROOT, "packs", pack.folder);
  const collectDefinitions = () => {
    const files = jsonFileEntries(root);
    expect(files.length, `${pack.folder}: no JSON files found`).toBeGreaterThan(
      0,
    );
    return files.flatMap(({ path, json }) =>
      definitions(path, json, pack.resource),
    );
  };

  it("keeps content files flat under the namespace folder", () => {
    const files = packFiles(root);
    expect(files.length, `${pack.folder}: no files found`).toBeGreaterThan(0);
    const offenders = files.filter((path) => {
      if (ENGINE_FIXED_FILES.has(path) || /^texts\/[^/]+\.lang$/.test(path)) {
        return false;
      }
      const folders = path.split("/").slice(0, -1);
      return (
        folders.length < 2 ||
        folders.at(-1) !== pack.namespace ||
        folders.slice(0, -1).some((folder) => NAMESPACES.has(folder))
      );
    });
    expect(offenders).toEqual([]);
  });

  it("keeps every path within the console limit", () => {
    // The Bedrock Wiki style guide caps a path at 80 characters for consoles,
    // counting from the pack folder (ADR 0047).
    const offenders = packFiles(root)
      .map((path) => `${pack.folder}/${path}`)
      .filter((path) => path.length > MAX_PATH_LENGTH);
    expect(offenders).toEqual([]);
  });

  it("namespaces every definition identifier", () => {
    const offenders = collectDefinitions().filter(({ identifier, dotted }) => {
      if (!dotted) return !identifier.startsWith(`${pack.namespace}:`);
      const segments = identifier.split(".");
      const namespaceIndex = identifier.startsWith("controller.") ? 2 : 1;
      return segments[namespaceIndex] !== pack.namespace;
    });
    expect(offenders).toEqual([]);
  });

  it("defines each identifier exactly once within its kind", () => {
    const byKind = new Map<string, Map<string, Definition[]>>();
    for (const definition of collectDefinitions()) {
      const identifiers = byKind.get(definition.kind) ?? new Map();
      const occurrences = identifiers.get(definition.identifier) ?? [];
      occurrences.push(definition);
      identifiers.set(definition.identifier, occurrences);
      byKind.set(definition.kind, identifiers);
    }
    const offenders = [...byKind.values()].flatMap((identifiers) =>
      [...identifiers.values()].filter((occurrences) => occurrences.length > 1),
    );
    expect(offenders).toEqual([]);
  });
});
