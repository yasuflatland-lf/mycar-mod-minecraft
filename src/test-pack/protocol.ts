// Shared by the in-game runner and scripts/game-test.mjs, so it must stay free
// of @minecraft/server imports and of TypeScript-only syntax that Node's type
// stripping cannot erase.

export const TEST_EVENT = "yasu_ride:test";
export const LOG_TAG = "[YASU-RIDE-TEST]";
export const MANUAL_RUN_ID = "manual";

const RUN_ID = /^[A-Za-z0-9_-]{1,32}$/;
const SHARD = /^([1-9]\d?)\/([1-9]\d?)$/;

/** 1-based, as in `2/3`: the second of three CI jobs. */
export interface Shard {
  index: number;
  total: number;
}

export const WHOLE_RUN: Shard = { index: 1, total: 1 };

export interface RunRequest {
  runId: string;
  shard: Shard;
}

export function shardFrom(text: string): Shard | undefined {
  const m = SHARD.exec(text);
  if (!m) return undefined;
  const index = Number(m[1]);
  const total = Number(m[2]);
  return index <= total ? { index, total } : undefined;
}

/**
 * The message is `<runId>` or `<runId> <index>/<total>`. A run started by hand
 * (`/scriptevent yasu_ride:test`) has no id, so it gets the manual id and the
 * whole suite.
 */
export function runRequestFrom(message: string): RunRequest {
  const [id = "", shardText, ...rest] = message.trim().split(/\s+/);
  const shard = shardText === undefined ? WHOLE_RUN : shardFrom(shardText);
  if (!RUN_ID.test(id) || !shard || rest.length > 0)
    return { runId: MANUAL_RUN_ID, shard: WHOLE_RUN };
  return { runId: id, shard };
}

/**
 * The 1-based shard of each test, packing the slowest first into the shard
 * with the fewest ticks so far (ADR 0054). Ties go to the earlier test and the
 * lower shard, so every CI job computes the same split.
 */
export function shardsOf(ticks: readonly number[], total: number): number[] {
  const load = new Array<number>(total).fill(0);
  const shards = new Array<number>(ticks.length);
  const slowestFirst = ticks
    .map((t, position) => ({ t, position }))
    .sort((a, b) => b.t - a.t || a.position - b.position);
  for (const { t, position } of slowestFirst) {
    const lightest = load.indexOf(Math.min(...load));
    load[lightest] = (load[lightest] ?? 0) + t;
    shards[position] = lightest + 1;
  }
  return shards;
}

export function linePrefix(runId: string): string {
  return `${LOG_TAG} ${runId} `;
}

/** Only this run's lines count; an earlier run can still be logging. */
export function linesOfRun(lines: readonly string[], runId: string): string[] {
  const prefix = linePrefix(runId);
  return lines.filter((l) => l.includes(prefix));
}

export function summaryOfRun(
  lines: readonly string[],
  runId: string,
): string | undefined {
  const marker = `${linePrefix(runId)}SUMMARY `;
  return lines.find((l) => l.includes(marker));
}

export function summaryPassed(summary: string): boolean {
  return /\bfail=0\b/.test(summary);
}
