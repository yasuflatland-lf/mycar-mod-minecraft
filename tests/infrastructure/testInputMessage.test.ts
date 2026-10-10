import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseTestInputMessage } from "../../src/infrastructure/testInput/testInputMessage";

const vehicleId = fc.string({ minLength: 1 }).filter((id) => !id.includes(","));
const axis = fc
  .double({ min: -1, max: 1, noNaN: true })
  .filter((value) => !Object.is(value, -0));
const finite = fc.double({ noNaN: true, noDefaultInfinity: true });

describe("parseTestInputMessage", () => {
  it("有効な入力をメッセージにして解析すると元の値に戻る", () => {
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

  it("clear は指定した車の入力解除を表す", () => {
    fc.assert(
      fc.property(vehicleId, (id) => {
        expect(parseTestInputMessage(`${id},clear`)).toEqual({
          vehicleId: id,
          input: undefined,
        });
      }),
    );
  });

  it("有限の移動値は必ず -1 から 1 の範囲に収まる", () => {
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

  it("どちらかの移動値が NaN や正負の Infinity なら拒否する", () => {
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

  it("数値に変換できない移動値を拒否する", () => {
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

  it("空文字や空白だけの移動値を拒否する", () => {
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

  it("要素数が 2 と 4 以外のメッセージを拒否する", () => {
    const part = fc.string().filter((value) => !value.includes(","));
    fc.assert(
      fc.property(
        fc
          .array(part, { maxLength: 10 })
          .filter((parts) => parts.length !== 2 && parts.length !== 4),
        (parts) => {
          expect(parseTestInputMessage(parts.join(","))).toBeUndefined();
        },
      ),
    );
  });

  it("要素が 2 個でも clear 以外なら拒否する", () => {
    const command = fc
      .string()
      .filter((value) => value !== "clear" && !value.includes(","));
    fc.assert(
      fc.property(vehicleId, command, (id, value) => {
        expect(parseTestInputMessage(`${id},${value}`)).toBeUndefined();
      }),
    );
  });

  it("ジャンプが 0 と 1 以外なら拒否する", () => {
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

  it("車の id が空なら入力も解除も拒否する", () => {
    fc.assert(
      fc.property(axis, axis, fc.boolean(), (x, y, jump) => {
        expect(
          parseTestInputMessage(`,${x},${y},${jump ? "1" : "0"}`),
        ).toBeUndefined();
        expect(parseTestInputMessage(",clear")).toBeUndefined();
      }),
    );
  });
});
