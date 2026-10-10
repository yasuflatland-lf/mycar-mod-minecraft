// tests/architecture.test.ts
// レイヤーの依存の向き (ADR 0012): インフラストラクチャ → アプリケーション → ドメイン の一方向だけ
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

const importsOf = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);

const RULES = [
  { layer: "src/domain", forbidden: ["/application", "/infrastructure", "@minecraft/"] },
  { layer: "src/application", forbidden: ["/infrastructure", "@minecraft/"] },
];

describe("レイヤーの依存の向き (ADR 0012)", () => {
  for (const { layer, forbidden } of RULES) {
    it(`${layer} は ${forbidden.join(", ")} を import しない`, () => {
      for (const file of tsFiles(layer)) {
        for (const imp of importsOf(file)) {
          for (const f of forbidden) expect(imp.includes(f), `${file} imports ${imp}`).toBe(false);
        }
      }
    });
  }
});
