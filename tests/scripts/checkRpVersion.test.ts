import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkResourcePackVersion } from "../../scripts/check-rp-version.mjs";

const version = fc.tuple(fc.nat(), fc.nat(), fc.nat());
const tag = version.map((value) => `v${value.join(".")}`);

describe("Resource Pack release version check", () => {
  it("skips an absent previous release regardless of changes or versions", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(undefined, ""),
        fc.boolean(),
        version,
        version,
        (tag, changed, previousVersion, currentVersion) => {
          expect(
            checkResourcePackVersion({
              tag,
              changed,
              previousVersion,
              currentVersion,
            }),
          ).toBeNull();
        },
      ),
    );
  });

  it("accepts an unchanged Resource Pack regardless of versions", () => {
    fc.assert(
      fc.property(
        tag,
        version,
        version,
        (tag, previousVersion, currentVersion) => {
          expect(
            checkResourcePackVersion({
              tag,
              changed: false,
              previousVersion,
              currentVersion,
            }),
          ).toBeNull();
        },
      ),
    );
  });

  it("rejects changed packs with equal versions and explains the cache constraint", () => {
    fc.assert(
      fc.property(tag, version, (tag, previousVersion) => {
        const error = checkResourcePackVersion({
          tag,
          changed: true,
          previousVersion,
          currentVersion: [...previousVersion],
        });
        const dotted = previousVersion.join(".");
        expect(error).toContain(`${dotted} at ${tag}`);
        expect(error).toContain(`${dotted} at HEAD`);
        expect(error).toContain("ADR 0015");
      }),
    );
  });

  it("accepts changed packs when any version component differs", () => {
    fc.assert(
      fc.property(
        tag,
        version,
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 1, max: 1000 }),
        (tag, previousVersion, index, increase) => {
          const currentVersion = previousVersion.map((value, component) =>
            component === index ? value + increase : value,
          );
          expect(
            checkResourcePackVersion({
              tag,
              changed: true,
              previousVersion,
              currentVersion,
            }),
          ).toBeNull();
        },
      ),
    );
  });
});
