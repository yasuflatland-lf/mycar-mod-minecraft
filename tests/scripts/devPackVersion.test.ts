import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEV_PATCH_BASE,
  devPackVersion,
  RESOURCE_PACK_UUID,
  readCounter,
  rewriteBehaviorPack,
  rewriteResourcePack,
  writeDevManifests,
} from "../../scripts/dev-pack-version.mjs";

const dependsOnResourcePack = (dependency: object) =>
  "uuid" in dependency && dependency.uuid === RESOURCE_PACK_UUID;

const version = fc.tuple(fc.nat(), fc.nat(), fc.nat());
const counter = fc.integer({ min: 0, max: 1_000_000 });
const uuid = fc.uuid();

const resourcePack = fc.record({
  format_version: fc.constant(2),
  header: fc.record({
    name: fc.string(),
    uuid,
    version,
    min_engine_version: version,
  }),
  modules: fc.array(fc.record({ type: fc.string(), uuid, version }), {
    minLength: 1,
    maxLength: 3,
  }),
  dependencies: fc.array(fc.record({ uuid, version })),
});

const behaviorPack = fc.record({
  format_version: fc.constant(2),
  header: fc.record({ name: fc.string(), uuid, version }),
  modules: fc.array(fc.record({ type: fc.string(), uuid, version })),
  dependencies: fc.array(
    fc.oneof(
      fc.record({ module_name: fc.string(), version: fc.string() }),
      fc.record({ uuid, version }),
      fc.record({ uuid: fc.constant(RESOURCE_PACK_UUID), version }),
    ),
  ),
});

describe("dev pack version", () => {
  it("keeps the committed major and minor and puts the patch at or above the dev base", () => {
    fc.assert(
      fc.property(version, counter, (committed, count) => {
        const [major, minor, patch] = devPackVersion(committed, count);
        expect([major, minor]).toEqual(committed.slice(0, 2));
        expect(patch).toBeGreaterThanOrEqual(DEV_PATCH_BASE);
      }),
    );
  });

  it("is strictly greater than the previous dev version", () => {
    fc.assert(
      fc.property(version, counter, (committed, previous) => {
        const before = devPackVersion(
          committed,
          readCounter(JSON.stringify({ counter: previous })),
        );
        const after = devPackVersion(
          committed,
          readCounter(JSON.stringify({ counter: previous })) + 1,
        );
        expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
        expect(after[2]).toBeGreaterThan(before[2] ?? Number.POSITIVE_INFINITY);
      }),
    );
  });

  it("starts from zero when the state file is missing or corrupt", () => {
    const corrupt = fc.oneof(
      fc.constant(undefined),
      fc.string().filter((text) => {
        try {
          JSON.parse(text);
          return false;
        } catch {
          return true;
        }
      }),
      fc
        .oneof(
          fc.integer({ max: 0 }),
          fc.double().filter((value) => !Number.isInteger(value)),
          fc.string(),
          fc.constant(null),
        )
        .map((value) => JSON.stringify({ counter: value })),
      fc.constantFrom("null", "[]", "{}", "42"),
    );
    fc.assert(
      fc.property(corrupt, (text) => {
        expect(readCounter(text)).toBe(0);
      }),
    );
  });

  it("reads back a positive counter", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (value) => {
        expect(readCounter(JSON.stringify({ counter: value }))).toBe(value);
      }),
    );
  });
});

describe("dev manifest rewrites", () => {
  it("sets the Resource Pack's header and module versions and nothing else", () => {
    fc.assert(
      fc.property(resourcePack, version, (manifest, dev) => {
        const original = structuredClone(manifest);
        const rewritten = rewriteResourcePack(manifest, dev);
        expect(manifest).toEqual(original);
        expect(rewritten.header.version).toEqual(dev);
        for (const module of rewritten.modules) {
          expect(module.version).toEqual(dev);
        }
        expect({
          ...rewritten,
          header: { ...rewritten.header, version: original.header.version },
          modules: rewritten.modules.map((module, index) => ({
            ...module,
            version: original.modules[index]?.version,
          })),
        }).toEqual(original);
      }),
    );
  });

  it("sets only the Behavior Pack's dependency on the Resource Pack", () => {
    fc.assert(
      fc.property(behaviorPack, version, (manifest, dev) => {
        const original = structuredClone(manifest);
        const rewritten = rewriteBehaviorPack(manifest, dev);
        expect(manifest).toEqual(original);
        expect(
          rewritten.dependencies.map((dependency, index) =>
            dependsOnResourcePack(dependency)
              ? original.dependencies[index]
              : dependency,
          ),
        ).toEqual(original.dependencies);
        expect({ ...rewritten, dependencies: [] }).toEqual({
          ...original,
          dependencies: [],
        });
        for (const dependency of rewritten.dependencies) {
          if (dependsOnResourcePack(dependency)) {
            expect(dependency.version).toEqual(dev);
          }
        }
      }),
    );
  });
});

describe("writing the dev manifests", () => {
  const packsDir = join(import.meta.dirname, "../../packs");
  const committedRp = JSON.parse(
    readFileSync(join(packsDir, "yasu_ride_rp/manifest.json"), "utf8"),
  );
  const dataDir = () => mkdtempSync(join(tmpdir(), "dev-pack-version-"));
  const readManifest = (dir: string, pack: string) =>
    JSON.parse(
      readFileSync(join(dir, "dev-manifests", pack, "manifest.json"), "utf8"),
    );

  it("counts up from 1 on each run and writes manifests that agree", () => {
    const dir = dataDir();
    const [major, minor] = committedRp.header.version;
    for (const expected of [1, 2, 3]) {
      const { version: dev } = writeDevManifests({ packsDir, dataDir: dir });
      expect(dev).toEqual([major, minor, DEV_PATCH_BASE + expected]);
      const rp = readManifest(dir, "yasu_ride_rp");
      const bp = readManifest(dir, "yasu_ride_bp");
      expect(rp.header.version).toEqual(dev);
      expect(bp.dependencies.find(dependsOnResourcePack).version).toEqual(dev);
      expect(
        JSON.parse(readFileSync(join(dir, "dev-pack-version.json"), "utf8")),
      ).toEqual({ counter: expected });
    }
  });

  it("starts again at 1 over a corrupt state file", () => {
    const dir = dataDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "dev-pack-version.json"), "{ not json");
    expect(writeDevManifests({ packsDir, dataDir: dir }).version[2]).toBe(
      DEV_PATCH_BASE + 1,
    );
  });

  it("leaves the committed Resource Pack manifest untouched", () => {
    writeDevManifests({ packsDir, dataDir: dataDir() });
    expect(
      JSON.parse(
        readFileSync(join(packsDir, "yasu_ride_rp/manifest.json"), "utf8"),
      ),
    ).toEqual(committedRp);
  });
});
