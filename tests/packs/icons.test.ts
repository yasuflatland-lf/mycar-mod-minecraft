import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const readIcon = (pack: string): Buffer =>
  readFileSync(new URL(`../../packs/${pack}/pack_icon.png`, import.meta.url));

/** Decodes an 8-bit RGB PNG into one Buffer of r, g, b bytes per row. */
const decodeRgbRows = (png: Buffer): Buffer[] => {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let pos = 8; pos < png.length; ) {
    const length = png.readUInt32BE(pos);
    if (png.toString("ascii", pos + 4, pos + 8) === "IDAT") {
      idat.push(png.subarray(pos + 8, pos + 8 + length));
    }
    pos += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  expect(raw.length).toBe(height * (stride + 1));
  return Array.from({ length: height }, (_, y) => {
    const start = y * (stride + 1);
    // tools/render_preview.py writes every row with filter type 0 (None), so
    // the bytes after the filter byte are the pixels themselves. Any other
    // filter means the icon came from somewhere else.
    expect(raw[start], `filter type of row ${y}`).toBe(0);
    return raw.subarray(start + 1, start + 1 + stride);
  });
};

describe.each(["yasu_ride_bp", "yasu_ride_rp", "yasu_ride_test_bp"])(
  "%s pack icon",
  (pack) => {
    it("contains a 256 by 256 RGB PNG at the pack root", () => {
      const png = readIcon(pack);
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      // IHDR comes first: width, height, bit depth 8, and color type 2 (RGB without alpha)
      expect(png.readUInt32BE(8)).toBe(13);
      expect(png.toString("ascii", 12, 16)).toBe("IHDR");
      expect(png.readUInt32BE(16)).toBe(256);
      expect(png.readUInt32BE(20)).toBe(256);
      expect(png[24]).toBe(8);
      expect(png[25]).toBe(2);
    });
  },
);

describe("pack icon variants", () => {
  it("gives both release packs the same icon", () => {
    expect(
      Buffer.concat(decodeRgbRows(readIcon("yasu_ride_bp"))).equals(
        Buffer.concat(decodeRgbRows(readIcon("yasu_ride_rp"))),
      ),
    ).toBe(true);
  });

  it("gives the test pack a grayscale icon", () => {
    const rows = decodeRgbRows(readIcon("yasu_ride_test_bp"));
    const colored = rows.flatMap((row, y) => {
      const hits: string[] = [];
      for (let i = 0; i < row.length; i += 3) {
        if (row[i] !== row[i + 1] || row[i] !== row[i + 2]) {
          hits.push(`(${i / 3}, ${y})`);
        }
      }
      return hits;
    });
    expect(colored.slice(0, 5)).toEqual([]);
  });
});
