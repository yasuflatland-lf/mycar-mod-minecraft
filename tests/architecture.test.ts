// Layer dependencies (ADR 0012): infrastructure -> application -> domain only
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
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
