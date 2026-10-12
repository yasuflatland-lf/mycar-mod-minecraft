import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseTestInputMessage } from "../../../../src/infrastructure/vehicle/testInput/testInputMessage";

const vehicleId = fc.string({ minLength: 1 }).filter((id) => !id.includes(","));
const axis = fc
  .double({ min: -1, max: 1, noNaN: true })
  .filter((value) => !Object.is(value, -0));
const finite = fc.double({ noNaN: true, noDefaultInfinity: true });
const part = fc.string().filter((value) => !value.includes(","));
const extraFields = fc.array(part, { minLength: 1, maxLength: 3 });

describe("parseTestInputMessage", () => {
  it("formatting a valid input as a message and parsing it returns the original values", () => {
    fc.assert(
      fc.property(vehicleId, axis, axis, fc.boolean(), (id, x, y, jump) => {
        expect(
          parseTestInputMessage(`${id},${x},${y},${jump ? "1" : "0"}`),
        ).toEqual({
          vehicleId: id,
          input: { moveX: x, moveY: y, jump },
        });
      }),
    );
  });

  it("clear means clearing the input of the given vehicle", () => {
    fc.assert(
      fc.property(vehicleId, (id) => {
        expect(parseTestInputMessage(`${id},clear`)).toEqual({
          vehicleId: id,
          input: undefined,
        });
      }),
    );
  });

  it("finite move values always fall within -1 to 1", () => {
    fc.assert(
      fc.property(vehicleId, finite, finite, fc.boolean(), (id, x, y, jump) => {
        const parsed = parseTestInputMessage(
          `${id},${x},${y},${jump ? "1" : "0"}`,
        );
        expect(parsed?.input).toBeDefined();
        expect(parsed?.input?.moveX).toBeGreaterThanOrEqual(-1);
        expect(parsed?.input?.moveX).toBeLessThanOrEqual(1);
        expect(parsed?.input?.moveY).toBeGreaterThanOrEqual(-1);
        expect(parsed?.input?.moveY).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("rejects the message when either move value is NaN or positive/negative Infinity", () => {
    fc.assert(
      fc.property(
        vehicleId,
        fc.constantFrom("NaN", "Infinity", "-Infinity"),
        finite,
        (id, invalid, valid) => {
          expect(
            parseTestInputMessage(`${id},${invalid},${valid},0`),
          ).toBeUndefined();
          expect(
            parseTestInputMessage(`${id},${valid},${invalid},1`),
          ).toBeUndefined();
        },
      ),
    );
  });

  it("rejects move values that cannot be converted to numbers", () => {
    const nonNumeric = fc
      .string()
      .filter((value) => Number.isNaN(Number(value)));
    fc.assert(
      fc.property(vehicleId, nonNumeric, finite, (id, invalid, valid) => {
        expect(
          parseTestInputMessage(`${id},${invalid},${valid},0`),
        ).toBeUndefined();
        expect(
          parseTestInputMessage(`${id},${valid},${invalid},1`),
        ).toBeUndefined();
      }),
    );
  });

  it("rejects empty or whitespace-only move values", () => {
    const blank = fc
      .array(fc.constantFrom(" ", "\t", "\n", "\r"))
      .map((chars) => chars.join(""));
    fc.assert(
      fc.property(vehicleId, blank, (id, invalid) => {
        expect(parseTestInputMessage(`${id},${invalid},0,0`)).toBeUndefined();
        expect(parseTestInputMessage(`${id},0,${invalid},1`)).toBeUndefined();
      }),
    );
  });

  it("rejects messages whose field count is not 2 or 4", () => {
    fc.assert(
      fc.property(
        fc
          .array(part, { maxLength: 10 })
          .filter((parts) => ![2, 4].includes(parts.length)),
        (parts) => {
          expect(parseTestInputMessage(parts.join(","))).toBeUndefined();
        },
      ),
    );
  });

  it("rejects a two-field message unless it is clear", () => {
    const command = fc
      .string()
      .filter((value) => value !== "clear" && !value.includes(","));
    fc.assert(
      fc.property(vehicleId, command, (id, value) => {
        expect(parseTestInputMessage(`${id},${value}`)).toBeUndefined();
      }),
    );
  });

  it("rejects a jump value other than 0 or 1", () => {
    const invalidJump = fc
      .string()
      .filter((value) => value !== "0" && value !== "1");
    fc.assert(
      fc.property(vehicleId, axis, axis, invalidJump, (id, x, y, jump) => {
        expect(
          parseTestInputMessage(`${id},${x},${y},${jump}`),
        ).toBeUndefined();
      }),
    );
  });

  it("rejects both input and clear when the vehicle id is empty", () => {
    fc.assert(
      fc.property(axis, axis, fc.boolean(), (x, y, jump) => {
        expect(
          parseTestInputMessage(`,${x},${y},${jump ? "1" : "0"}`),
        ).toBeUndefined();
        expect(parseTestInputMessage(",clear")).toBeUndefined();
      }),
    );
  });

  it("rejects a clear followed by more fields", () => {
    fc.assert(
      fc.property(vehicleId, extraFields, (id, rest) => {
        expect(
          parseTestInputMessage(`${id},clear,${rest.join(",")}`),
        ).toBeUndefined();
      }),
    );
  });

  it("rejects a valid input followed by more fields", () => {
    fc.assert(
      fc.property(
        vehicleId,
        axis,
        axis,
        fc.boolean(),
        extraFields,
        (id, x, y, jump, rest) => {
          expect(
            parseTestInputMessage(
              `${id},${x},${y},${jump ? "1" : "0"},${rest.join(",")}`,
            ),
          ).toBeUndefined();
        },
      ),
    );
  });
});
