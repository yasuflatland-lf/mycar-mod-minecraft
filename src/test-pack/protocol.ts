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

// Round robin keeps the slow groups (flight, submarine, boat), which sit next
// to each other in the list, spread over the shards.
export function inShard(position: number, shard: Shard): boolean {
  return position % shard.total === shard.index - 1;
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
