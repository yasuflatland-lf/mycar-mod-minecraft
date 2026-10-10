import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  linePrefix,
  linesOfRun,
  MANUAL_RUN_ID,
  runIdFrom,
  summaryOfRun,
  summaryPassed,
} from "../../src/test-pack/protocol";

const runId = fc.stringMatching(/^[A-Za-z0-9_-]{1,32}$/);
const twoRunIds = fc
  .tuple(runId, runId)
  .filter(([a, b]) => a !== b && !a.endsWith(b) && !b.endsWith(a));
const counts = fc.nat({ max: 6 });

function summaryLine(id: string, fail: number): string {
  return `2026 WARN ${linePrefix(id)}SUMMARY pass=${6 - fail} fail=${fail}`;
}

describe("runIdFrom", () => {
  it("returns a well-formed id from the scriptevent message", () => {
    fc.assert(
      fc.property(runId, (id) => {
        expect(runIdFrom(` ${id} `)).toBe(id);
      }),
    );
  });

  it("falls back to the manual id for an empty or malformed message", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(""),
          fc.string().filter((s) => /[^\w\s-]/.test(s)),
        ),
        (msg) => {
          expect(runIdFrom(msg)).toBe(MANUAL_RUN_ID);
        },
      ),
    );
  });
});

describe("a run reads only its own lines", () => {
  it("ignores the SUMMARY and results of another run", () => {
    fc.assert(
      fc.property(twoRunIds, counts, counts, ([mine, other], f1, f2) => {
        const logs = [
          `${linePrefix(other)}PASS ram_cow`,
          summaryLine(other, f1),
          `${linePrefix(mine)}FAIL ram_cow`,
          summaryLine(mine, f2),
        ];
        expect(summaryOfRun(logs, mine)).toBe(summaryLine(mine, f2));
        expect(linesOfRun(logs, mine)).toEqual([logs[2], logs[3]]);
        expect(summaryOfRun(logs.slice(0, 2), mine)).toBeUndefined();
      }),
    );
  });
});

describe("summaryPassed", () => {
  it("passes only when no test failed", () => {
    fc.assert(
      fc.property(runId, counts, (id, fail) => {
        expect(summaryPassed(summaryLine(id, fail))).toBe(fail === 0);
      }),
    );
  });
});
