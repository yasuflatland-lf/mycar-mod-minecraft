import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  inShard,
  LOG_TAG,
  linePrefix,
  linesOfRun,
  MANUAL_RUN_ID,
  runRequestFrom,
  shardFrom,
  summaryOfRun,
  summaryPassed,
  TEST_EVENT,
  WHOLE_RUN,
} from "../../src/test-pack/protocol";

const runId = fc.stringMatching(/^[A-Za-z0-9_-]{1,32}$/);
const twoRunIds = fc
  .tuple(runId, runId)
  .filter(([a, b]) => a !== b && !a.endsWith(b) && !b.endsWith(a));
const counts = fc.nat({ max: 6 });

function summaryLine(id: string, fail: number): string {
  return `2026 WARN ${linePrefix(id)}SUMMARY pass=${6 - fail} fail=${fail}`;
}

const shard = fc
  .integer({ min: 1, max: 99 })
  .chain((total) =>
    fc.integer({ min: 1, max: total }).map((index) => ({ index, total })),
  );

describe("runRequestFrom", () => {
  it("runs the whole suite for a message with only a run id", () => {
    fc.assert(
      fc.property(runId, (id) => {
        expect(runRequestFrom(` ${id} `)).toEqual({
          runId: id,
          shard: WHOLE_RUN,
        });
      }),
    );
  });

  it("reads the shard that follows the run id", () => {
    fc.assert(
      fc.property(runId, shard, (id, s) => {
        expect(runRequestFrom(`${id} ${s.index}/${s.total}`)).toEqual({
          runId: id,
          shard: s,
        });
      }),
    );
  });

  it("falls back to a whole manual run for an empty or malformed message", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(""),
          fc.string().filter((s) => /[^\w\s/-]/.test(s)),
          runId.map((id) => `${id} 3/2`),
          runId.map((id) => `${id} 1/2 extra`),
        ),
        (msg) => {
          expect(runRequestFrom(msg)).toEqual({
            runId: MANUAL_RUN_ID,
            shard: WHOLE_RUN,
          });
        },
      ),
    );
  });
});

describe("shardFrom", () => {
  it("rejects an index of 0, above the total, or a malformed text", () => {
    for (const text of ["0/2", "3/2", "1/0", "1-2", "1/2/3", "", " 1/2"])
      expect(shardFrom(text)).toBeUndefined();
  });
});

describe("inShard", () => {
  it("puts every test in exactly one shard", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 200 }),
        fc.integer({ min: 1, max: 99 }),
        (position, total) => {
          const owners = Array.from({ length: total }, (_, i) => i + 1).filter(
            (index) => inShard(position, { index, total }),
          );
          expect(owners).toHaveLength(1);
        },
      ),
    );
  });

  it("gives the shards counts that differ by at most one", () => {
    fc.assert(
      fc.property(fc.nat({ max: 200 }), shard, (count, s) => {
        const mine = Array.from({ length: count }, (_, i) => i).filter((i) =>
          inShard(i, s),
        ).length;
        expect(Math.abs(mine - count / s.total)).toBeLessThan(1);
      }),
    );
  });
});

describe("a run reads only its own lines", () => {
  it("ignores a line that names the run id without LOG_TAG", () => {
    fc.assert(
      fc.property(runId, (id) => {
        expect(LOG_TAG.trim()).not.toBe("");
        const chat = `2026 INFO <Steve> ${id} SUMMARY pass=6 fail=0`;
        expect(linesOfRun([chat], id)).toEqual([]);
        expect(summaryOfRun([chat], id)).toBeUndefined();
      }),
    );
  });

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

describe("TEST_EVENT", () => {
  it("is a namespaced scriptevent id outside the minecraft namespace", () => {
    expect(TEST_EVENT).toMatch(/^[a-z0-9_]+:[a-z0-9_]+$/);
    expect(TEST_EVENT.startsWith("minecraft:")).toBe(false);
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
