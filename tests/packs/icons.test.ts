import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe.each(["yasu_ride_bp", "yasu_ride_rp", "yasu_ride_test_bp"])(
  "%s pack icon",
  (pack) => {
    it("contains a 256 by 256 RGB PNG at the pack root", () => {
      const png = readFileSync(
        new URL(`../../packs/${pack}/pack_icon.png`, import.meta.url),
      );
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(png.readUInt32BE(8)).toBe(13);
      expect(png.toString("ascii", 12, 16)).toBe("IHDR");
      expect(png.readUInt32BE(16)).toBe(256);
      expect(png.readUInt32BE(20)).toBe(256);
      expect(png[24]).toBe(8);
      expect(png[25]).toBe(2);
    });
  },
);
