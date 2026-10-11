// Layer dependencies (ADR 0012): infrastructure -> application -> domain only
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Resolved from this file rather than cwd so a different vitest --root cannot
// make the layer directories disappear and the checks pass vacuously.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

// Covers `from "x"`, side-effect `import "x"`, and dynamic `import("x")`.
const IMPORT_SPECIFIER = /(?:\bfrom\s+|\bimport\s*\(?\s*)["']([^"']+)["']/g;

function importsOf(source: string): string[] {
  return [...source.matchAll(IMPORT_SPECIFIER)].map((m) => m[1] ?? "");
}

const LAYERS = ["domain", "application", "infrastructure"];
const FEATURES = new Set(
  LAYERS.flatMap((layer) =>
    readdirSync(join(REPO_ROOT, "src", layer), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "shared")
      .map((entry) => entry.name),
  ),
);

function featureOf(file: string): string | undefined {
  const [layer, feature, ...rest] = relative(
    join(REPO_ROOT, "src"),
    file,
  ).split(sep);
  if (layer && LAYERS.includes(layer) && feature && rest.length > 0) {
    return feature;
  }
  return undefined;
}

function allowsFeatureImport(
  file: string,
  specifier: string,
  features: ReadonlySet<string>,
): boolean {
  if (!specifier.startsWith(".")) return true;
  const source = featureOf(file);
  const resolved = resolve(dirname(file), specifier);
  const target = featureOf(
    extname(resolved) ? resolved : join(resolved, "index.ts"),
  );
  if (!target || !features.has(target)) return true;
  return source === undefined || source === target;
}

const RULES = [
  {
    layer: "src/domain",
    required: true,
    forbidden: ["/application", "/infrastructure", "@minecraft/"],
  },
  {
    layer: "src/application",
    required: false,
    forbidden: ["/infrastructure", "@minecraft/"],
  },
];

describe("importsOf", () => {
  it.each([
    ['import { a } from "@minecraft/server";', "@minecraft/server"],
    ['import "@minecraft/server";', "@minecraft/server"],
    ['await import("@minecraft/server");', "@minecraft/server"],
    ["export * from '../infrastructure/x';", "../infrastructure/x"],
  ])("finds the specifier in %s", (source, specifier) => {
    expect(importsOf(source)).toEqual([specifier]);
  });
});

describe("Feature import resolver", () => {
  it.each([
    ["application/vehicle/place.ts", "../../domain/vehicle/vehicle", true],
    ["domain/vehicle/motion.ts", "./vehicle", true],
    ["domain/vehicle/motion.ts", "../building/wall", false],
    ["domain/vehicle/motion.ts", "../building", false],
    [
      "infrastructure/vehicle/bedrock/world.ts",
      "../../../domain/building/wall",
      false,
    ],
    ["domain/shared/vec.ts", "../vehicle/motion", false],
    [
      "infrastructure/shared/helper.ts",
      "../../application/vehicle/ports",
      false,
    ],
    ["domain/vehicle/motion.ts", "../shared/vec", true],
    ["domain/shared/vec.ts", "./math", true],
    ["infrastructure/bootstrap.ts", "./vehicle/install", true],
    ["domain/vehicle/motion.ts", "./nested/../../building/wall", false],
    ["domain/vehicle/motion.ts", "../../../tests/domain/building/wall", true],
  ])("resolves %s importing %s as allowed=%s", (file, specifier, allowed) => {
    expect(
      allowsFeatureImport(
        join(REPO_ROOT, "src", file),
        specifier,
        new Set(["vehicle", "building"]),
      ),
    ).toBe(allowed);
  });
});

describe("Feature boundaries (ADR 0046)", () => {
  for (const layer of LAYERS) {
    const dir = join(REPO_ROOT, "src", layer);
    it(`${layer} keeps files in shared or feature folders`, () => {
      const directFiles = tsFiles(dir).filter((file) => dirname(file) === dir);
      expect(directFiles).toEqual(
        layer === "infrastructure" ? [join(dir, "bootstrap.ts")] : [],
      );
    });

    it(`${layer} does not import across features or from shared into a feature`, () => {
      for (const file of tsFiles(dir)) {
        for (const specifier of importsOf(readFileSync(file, "utf8"))) {
          expect(
            allowsFeatureImport(file, specifier, FEATURES),
            `${file} imports ${specifier}`,
          ).toBe(true);
        }
      }
    });
  }
});

describe("Layer dependency direction (ADR 0012)", () => {
  for (const { layer, required, forbidden } of RULES) {
    const dir = join(REPO_ROOT, layer);
    it(`${layer} does not import ${forbidden.join(", ")}`, () => {
      const files = tsFiles(dir);
      if (required || existsSync(dir)) {
        expect(files.length, `${layer} has no .ts files`).toBeGreaterThan(0);
      }
      for (const file of files) {
        for (const imp of importsOf(readFileSync(file, "utf8"))) {
          for (const pattern of forbidden) {
            expect(imp.includes(pattern), `${file} imports ${imp}`).toBe(false);
          }
        }
      }
    });
  }
});

describe("Entry point (ADR 0012)", () => {
  it("src/main.ts imports only ./infrastructure/bootstrap", () => {
    const source = readFileSync(join(REPO_ROOT, "src/main.ts"), "utf8");
    expect(importsOf(source)).toEqual(["./infrastructure/bootstrap"]);
  });
});
