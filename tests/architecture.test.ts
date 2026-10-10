// Layer dependencies (ADR 0012): infrastructure -> application -> domain only
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

function importsOf(file: string): string[] {
  const matches = readFileSync(file, "utf8").matchAll(
    /from\s+["']([^"']+)["']/g,
  );
  return [...matches].map((m) => m[1] ?? "");
}

const RULES = [
  {
    layer: "src/domain",
    forbidden: ["/application", "/infrastructure", "@minecraft/"],
  },
  { layer: "src/application", forbidden: ["/infrastructure", "@minecraft/"] },
];

describe("Layer dependency direction (ADR 0012)", () => {
  for (const { layer, forbidden } of RULES) {
    it(`${layer} does not import ${forbidden.join(", ")}`, () => {
      for (const file of tsFiles(layer)) {
        for (const imp of importsOf(file)) {
          for (const pattern of forbidden) {
            expect(imp.includes(pattern), `${file} imports ${imp}`).toBe(false);
          }
        }
      }
    });
  }
});
