// Layer dependencies (ADR 0012): infrastructure -> application -> domain only.
// Feature boundaries within each layer (ADR 0046), checked with dependency-cruiser (ADR 0065).
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cruise } from "dependency-cruiser";
import { describe, expect, it } from "vitest";

// Resolved from this file rather than cwd so a different vitest --root cannot
// make the layer directories disappear and the checks pass vacuously.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

const LAYERS = ["domain", "application", "infrastructure"];
const FEATURES = new Set(
  LAYERS.flatMap((layer) =>
    readdirSync(join(SRC, layer), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "shared")
      .map((entry) => entry.name),
  ),
);

describe("Feature boundaries (ADR 0046)", () => {
  it("finds the vehicle feature folder", () => {
    expect([...FEATURES]).toContain("vehicle");
  });

  for (const layer of LAYERS) {
    const dir = join(SRC, layer);
    it(`${layer} keeps files in shared or feature folders`, () => {
      const directFiles = tsFiles(dir).filter((file) => dirname(file) === dir);
      expect(directFiles).toEqual(
        layer === "infrastructure" ? [join(dir, "bootstrap.ts")] : [],
      );
    });
  }
});

const config = createRequire(import.meta.url)("../.dependency-cruiser.cjs");

async function violations(files: Record<string, string>): Promise<string[]> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "depcruise-")));
  try {
    writeFileSync(join(root, "tsconfig.json"), "{}");
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    const result = await cruise(["src"], {
      ...config.options,
      tsConfig: undefined,
      baseDir: root,
      validate: true,
      ruleSet: { forbidden: config.forbidden },
    });
    if (typeof result.output === "string") throw new Error(result.output);
    return result.output.summary.violations.map((v) => v.rule.name);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("dependency-cruiser rules (ADR 0065)", () => {
  it.each<[string, Record<string, string>, string[]]>([
    [
      "same kind",
      {
        "src/domain/vehicle/kinds/suv/drive.ts": 'import { x } from "./form";',
        "src/domain/vehicle/kinds/suv/form.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "other kind",
      {
        "src/domain/vehicle/kinds/suv/drive.ts":
          'import { x } from "../sportsboat/drive";',
        "src/domain/vehicle/kinds/sportsboat/drive.ts": "export const x = 1;",
      },
      ["kind-imports-other-kind"],
    ],
    [
      "kind importing the registry",
      {
        "src/domain/vehicle/kinds/suv/drive.ts":
          'import { x } from "../index";',
        "src/domain/vehicle/kinds/index.ts": "export const x = 1;",
      },
      ["kind-imports-other-kind"],
    ],
    [
      "registry wiring",
      {
        "src/domain/vehicle/kinds/index.ts": 'import { x } from "./suv/drive";',
        "src/domain/vehicle/kinds/suv/drive.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "core contract",
      {
        "src/domain/vehicle/vehicle.ts": 'import { x } from "./drive";',
        "src/domain/vehicle/drive.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "core importing kind",
      {
        "src/domain/vehicle/vehicle.ts":
          'import { x } from "./kinds/suv/spec";',
        "src/domain/vehicle/kinds/suv/spec.ts": "export const x = 1;",
      },
      ["core-imports-kind"],
    ],
    [
      "core importing registry",
      {
        "src/domain/vehicle/vehicle.ts": 'import { x } from "./kinds/index";',
        "src/domain/vehicle/kinds/index.ts": "export const x = 1;",
      },
      ["core-imports-kind"],
    ],
    [
      "motion importing kind",
      {
        "src/domain/vehicle/motion/motion.ts":
          'import { x } from "../kinds/suv/spec";',
        "src/domain/vehicle/kinds/suv/spec.ts": "export const x = 1;",
      },
      ["core-imports-kind"],
    ],
    [
      "motion contract",
      {
        "src/domain/vehicle/motion/motion.ts":
          'import { x } from "../profile";',
        "src/domain/vehicle/profile.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "core tuning",
      {
        "src/domain/vehicle/vehicle.ts": 'import { x } from "./spec";',
        "src/domain/vehicle/spec.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "core importing motion",
      {
        "src/domain/vehicle/vehicle.ts": 'import { x } from "./motion/motion";',
        "src/domain/vehicle/motion/motion.ts": "export const x = 1;",
      },
      ["core-imports-motion"],
    ],
    [
      "application entry",
      {
        "src/application/vehicle/place.ts":
          'import { x } from "../../domain/vehicle/kinds/index";',
        "src/domain/vehicle/kinds/index.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "application folder entry",
      {
        "src/application/vehicle/place.ts":
          'import { x } from "../../domain/vehicle/kinds";',
        "src/domain/vehicle/kinds/index.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "application kind",
      {
        "src/application/vehicle/place.ts":
          'import { x } from "../../domain/vehicle/kinds/suv/drive";',
        "src/domain/vehicle/kinds/suv/drive.ts": "export const x = 1;",
      },
      ["outer-layer-imports-kind"],
    ],
    [
      "infrastructure entry",
      {
        "src/infrastructure/vehicle/world.ts":
          'import { x } from "../../domain/vehicle/kinds/index.ts";',
        "src/domain/vehicle/kinds/index.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "infrastructure kind",
      {
        "src/infrastructure/vehicle/world.ts":
          'import { x } from "../../domain/vehicle/kinds/sportsboat/profile";',
        "src/domain/vehicle/kinds/sportsboat/profile.ts": "export const x = 1;",
      },
      ["outer-layer-imports-kind"],
    ],
    [
      "kind names without imports",
      {
        "src/domain/vehicle/kind.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "kind names importing a type",
      {
        "src/domain/vehicle/kind.ts": 'import type { x } from "./profile";',
        "src/domain/vehicle/profile.ts": "export const x = 1;",
      },
      ["kind-names-import-nothing"],
    ],
    [
      "kind names importing a built-in package",
      {
        "src/domain/vehicle/kind.ts": 'import { x } from "node:fs";',
      },
      ["kind-names-import-nothing"],
    ],
    [
      "normalized other kind",
      {
        "src/domain/vehicle/kinds/suv/drive.ts":
          'import { x } from "./nested/../../sportsboat/drive";',
        "src/domain/vehicle/kinds/sportsboat/drive.ts": "export const x = 1;",
      },
      ["kind-imports-other-kind"],
    ],
    [
      "application importing domain",
      {
        "src/application/vehicle/place.ts":
          'import { x } from "../../domain/vehicle/vehicle";',
        "src/domain/vehicle/vehicle.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "same feature",
      {
        "src/domain/vehicle/motion.ts": 'import { x } from "./vehicle";',
        "src/domain/vehicle/vehicle.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "other feature",
      {
        "src/domain/vehicle/motion.ts": 'import { x } from "../building/wall";',
        "src/domain/building/wall.ts": "export const x = 1;",
      },
      ["feature-imports-other-feature"],
    ],
    [
      "other feature folder",
      {
        "src/domain/vehicle/motion.ts": 'import { x } from "../building";',
        "src/domain/building/index.ts": "export const x = 1;",
      },
      ["feature-imports-other-feature"],
    ],
    [
      "other feature across layers",
      {
        "src/infrastructure/vehicle/bedrock/world.ts":
          'import { x } from "../../../domain/building/wall";',
        "src/domain/building/wall.ts": "export const x = 1;",
      },
      ["feature-imports-other-feature"],
    ],
    [
      "shared into a feature",
      {
        "src/domain/shared/vec.ts": 'import { x } from "../vehicle/motion";',
        "src/domain/vehicle/motion.ts": "export const x = 1;",
      },
      ["feature-imports-other-feature"],
    ],
    [
      "shared into a feature across layers",
      {
        "src/infrastructure/shared/helper.ts":
          'import { x } from "../../application/vehicle/ports";',
        "src/application/vehicle/ports.ts": "export const x = 1;",
      },
      ["feature-imports-other-feature"],
    ],
    [
      "feature into shared",
      {
        "src/domain/vehicle/motion.ts": 'import { x } from "../shared/vec";',
        "src/domain/shared/vec.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "shared into shared",
      {
        "src/domain/shared/vec.ts": 'import { x } from "./math";',
        "src/domain/shared/math.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "bootstrap wires features",
      {
        "src/infrastructure/bootstrap.ts":
          'import { x } from "./vehicle/install";',
        "src/infrastructure/vehicle/install.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "normalized other feature",
      {
        "src/domain/vehicle/motion.ts":
          'import { x } from "./nested/../../building/wall";',
        "src/domain/building/wall.ts": "export const x = 1;",
      },
      ["feature-imports-other-feature"],
    ],
    [
      "outside source layers",
      {
        "src/domain/vehicle/motion.ts":
          'import { x } from "../../../tests/domain/building/wall";',
        "tests/domain/building/wall.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "domain importing application",
      {
        "src/domain/vehicle/x.ts":
          'import { x } from "../../application/vehicle/ports";',
        "src/application/vehicle/ports.ts": "export const x = 1;",
      },
      ["domain-imports-outer-layer"],
    ],
    [
      "domain importing infrastructure",
      {
        "src/domain/vehicle/x.ts":
          'import { x } from "../../infrastructure/vehicle/install";',
        "src/infrastructure/vehicle/install.ts": "export const x = 1;",
      },
      ["domain-imports-outer-layer"],
    ],
    [
      "application importing infrastructure",
      {
        "src/application/vehicle/x.ts":
          'import { x } from "../../infrastructure/vehicle/install";',
        "src/infrastructure/vehicle/install.ts": "export const x = 1;",
      },
      ["application-imports-infrastructure"],
    ],
    [
      "main importing bootstrap",
      {
        "src/main.ts": 'import { x } from "./infrastructure/bootstrap";',
        "src/infrastructure/bootstrap.ts": "export const x = 1;",
      },
      [],
    ],
    [
      "main importing past bootstrap",
      {
        "src/main.ts": 'import { x } from "./infrastructure/vehicle/install";',
        "src/infrastructure/vehicle/install.ts": "export const x = 1;",
      },
      ["main-imports-only-bootstrap"],
    ],
    [
      "unresolvable import",
      {
        "src/domain/vehicle/x.ts": 'import { x } from "./missing";',
      },
      ["not-resolvable"],
    ],
    [
      "test pack excluded",
      {
        "src/test-pack/runner.ts":
          'import { x } from "../domain/vehicle/kinds/suv/spec";',
        "src/domain/vehicle/kinds/suv/spec.ts": "export const x = 1;",
      },
      [],
    ],
  ])("%s", async (_name, files, expectedRuleNames) => {
    expect(await violations(files)).toEqual(expectedRuleNames);
  });
});
