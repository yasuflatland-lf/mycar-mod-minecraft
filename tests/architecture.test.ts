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

const EXPORTS_X = "export const x = 1;";

function importX(specifier: string): string {
  return `import { x } from "${specifier}";`;
}

describe("dependency-cruiser rules (ADR 0065)", () => {
  it.each<[string, Record<string, string>, string[]]>([
    [
      "same kind",
      {
        "src/domain/vehicle/kinds/suv/drive.ts": importX("./form"),
        "src/domain/vehicle/kinds/suv/form.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "other kind",
      {
        "src/domain/vehicle/kinds/suv/drive.ts": importX("../sportsboat/drive"),
        "src/domain/vehicle/kinds/sportsboat/drive.ts": EXPORTS_X,
      },
      ["kind-imports-other-kind"],
    ],
    [
      "kind importing the registry",
      {
        "src/domain/vehicle/kinds/suv/drive.ts": importX("../index"),
        "src/domain/vehicle/kinds/index.ts": EXPORTS_X,
      },
      ["kind-imports-other-kind"],
    ],
    [
      "registry wiring",
      {
        "src/domain/vehicle/kinds/index.ts": importX("./suv/drive"),
        "src/domain/vehicle/kinds/suv/drive.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "core contract",
      {
        "src/domain/vehicle/vehicle.ts": importX("./drive"),
        "src/domain/vehicle/drive.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "core importing kind",
      {
        "src/domain/vehicle/vehicle.ts": importX("./kinds/suv/spec"),
        "src/domain/vehicle/kinds/suv/spec.ts": EXPORTS_X,
      },
      ["core-imports-kind"],
    ],
    [
      "core importing registry",
      {
        "src/domain/vehicle/vehicle.ts": importX("./kinds/index"),
        "src/domain/vehicle/kinds/index.ts": EXPORTS_X,
      },
      ["core-imports-kind"],
    ],
    [
      "motion importing kind",
      {
        "src/domain/vehicle/motion/motion.ts": importX("../kinds/suv/spec"),
        "src/domain/vehicle/kinds/suv/spec.ts": EXPORTS_X,
      },
      ["core-imports-kind"],
    ],
    [
      "motion contract",
      {
        "src/domain/vehicle/motion/motion.ts": importX("../profile"),
        "src/domain/vehicle/profile.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "core tuning",
      {
        "src/domain/vehicle/vehicle.ts": importX("./spec"),
        "src/domain/vehicle/spec.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "core importing motion",
      {
        "src/domain/vehicle/vehicle.ts": importX("./motion/motion"),
        "src/domain/vehicle/motion/motion.ts": EXPORTS_X,
      },
      ["core-imports-motion"],
    ],
    [
      "application entry",
      {
        "src/application/vehicle/place.ts": importX(
          "../../domain/vehicle/kinds/index",
        ),
        "src/domain/vehicle/kinds/index.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "application folder entry",
      {
        "src/application/vehicle/place.ts": importX(
          "../../domain/vehicle/kinds",
        ),
        "src/domain/vehicle/kinds/index.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "application kind",
      {
        "src/application/vehicle/place.ts": importX(
          "../../domain/vehicle/kinds/suv/drive",
        ),
        "src/domain/vehicle/kinds/suv/drive.ts": EXPORTS_X,
      },
      ["outer-layer-imports-kind"],
    ],
    [
      "infrastructure entry",
      {
        "src/infrastructure/vehicle/world.ts": importX(
          "../../domain/vehicle/kinds/index.ts",
        ),
        "src/domain/vehicle/kinds/index.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "infrastructure kind",
      {
        "src/infrastructure/vehicle/world.ts": importX(
          "../../domain/vehicle/kinds/sportsboat/profile",
        ),
        "src/domain/vehicle/kinds/sportsboat/profile.ts": EXPORTS_X,
      },
      ["outer-layer-imports-kind"],
    ],
    [
      "kind names without imports",
      {
        "src/domain/vehicle/kind.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "kind names importing a type",
      {
        "src/domain/vehicle/kind.ts": 'import type { x } from "./profile";',
        "src/domain/vehicle/profile.ts": EXPORTS_X,
      },
      ["kind-names-import-nothing"],
    ],
    [
      "kind names importing a built-in package",
      {
        "src/domain/vehicle/kind.ts": importX("node:fs"),
      },
      ["kind-names-import-nothing"],
    ],
    [
      "normalized other kind",
      {
        "src/domain/vehicle/kinds/suv/drive.ts": importX(
          "./nested/../../sportsboat/drive",
        ),
        "src/domain/vehicle/kinds/sportsboat/drive.ts": EXPORTS_X,
      },
      ["kind-imports-other-kind"],
    ],
    [
      "application importing domain",
      {
        "src/application/vehicle/place.ts": importX(
          "../../domain/vehicle/vehicle",
        ),
        "src/domain/vehicle/vehicle.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "same feature",
      {
        "src/domain/vehicle/motion.ts": importX("./vehicle"),
        "src/domain/vehicle/vehicle.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "other feature",
      {
        "src/domain/vehicle/motion.ts": importX("../building/wall"),
        "src/domain/building/wall.ts": EXPORTS_X,
      },
      ["feature-imports-other-feature"],
    ],
    [
      "other feature folder",
      {
        "src/domain/vehicle/motion.ts": importX("../building"),
        "src/domain/building/index.ts": EXPORTS_X,
      },
      ["feature-imports-other-feature"],
    ],
    [
      "other feature across layers",
      {
        "src/infrastructure/vehicle/bedrock/world.ts": importX(
          "../../../domain/building/wall",
        ),
        "src/domain/building/wall.ts": EXPORTS_X,
      },
      ["feature-imports-other-feature"],
    ],
    [
      "shared into a feature",
      {
        "src/domain/shared/vec.ts": importX("../vehicle/motion"),
        "src/domain/vehicle/motion.ts": EXPORTS_X,
      },
      ["feature-imports-other-feature"],
    ],
    [
      "shared into a feature across layers",
      {
        "src/infrastructure/shared/helper.ts": importX(
          "../../application/vehicle/ports",
        ),
        "src/application/vehicle/ports.ts": EXPORTS_X,
      },
      ["feature-imports-other-feature"],
    ],
    [
      "feature into shared",
      {
        "src/domain/vehicle/motion.ts": importX("../shared/vec"),
        "src/domain/shared/vec.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "shared into shared",
      {
        "src/domain/shared/vec.ts": importX("./math"),
        "src/domain/shared/math.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "bootstrap wires features",
      {
        "src/infrastructure/bootstrap.ts": importX("./vehicle/install"),
        "src/infrastructure/vehicle/install.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "normalized other feature",
      {
        "src/domain/vehicle/motion.ts": importX("./nested/../../building/wall"),
        "src/domain/building/wall.ts": EXPORTS_X,
      },
      ["feature-imports-other-feature"],
    ],
    [
      "outside source layers",
      {
        "src/domain/vehicle/motion.ts": importX(
          "../../../tests/domain/building/wall",
        ),
        "tests/domain/building/wall.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "domain importing application",
      {
        "src/domain/vehicle/x.ts": importX("../../application/vehicle/ports"),
        "src/application/vehicle/ports.ts": EXPORTS_X,
      },
      ["domain-imports-outer-layer"],
    ],
    [
      "domain importing infrastructure",
      {
        "src/domain/vehicle/x.ts": importX(
          "../../infrastructure/vehicle/install",
        ),
        "src/infrastructure/vehicle/install.ts": EXPORTS_X,
      },
      ["domain-imports-outer-layer"],
    ],
    [
      "application importing infrastructure",
      {
        "src/application/vehicle/x.ts": importX(
          "../../infrastructure/vehicle/install",
        ),
        "src/infrastructure/vehicle/install.ts": EXPORTS_X,
      },
      ["application-imports-infrastructure"],
    ],
    [
      "main importing bootstrap",
      {
        "src/main.ts": importX("./infrastructure/bootstrap"),
        "src/infrastructure/bootstrap.ts": EXPORTS_X,
      },
      [],
    ],
    [
      "main importing past bootstrap",
      {
        "src/main.ts": importX("./infrastructure/vehicle/install"),
        "src/infrastructure/vehicle/install.ts": EXPORTS_X,
      },
      ["main-imports-only-bootstrap"],
    ],
    [
      "unresolvable import",
      {
        "src/domain/vehicle/x.ts": importX("./missing"),
      },
      ["not-resolvable"],
    ],
    [
      "test pack excluded",
      {
        "src/test-pack/runner.ts": importX("../domain/vehicle/kinds/suv/spec"),
        "src/domain/vehicle/kinds/suv/spec.ts": EXPORTS_X,
      },
      [],
    ],
  ])("%s", async (_name, files, expectedRuleNames) => {
    expect(await violations(files)).toEqual(expectedRuleNames);
  });
});
