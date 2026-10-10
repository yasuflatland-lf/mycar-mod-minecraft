// Shared by the in-game runner and scripts/game-test.mjs, so it must stay free
// of @minecraft/server imports and of TypeScript-only syntax that Node's type
// stripping cannot erase.

export const TEST_EVENT = "mycar:test";
export const LOG_TAG = "[MYCAR-TEST]";
export const MANUAL_RUN_ID = "manual";

const RUN_ID = /^[A-Za-z0-9_-]{1,32}$/;

/** A run started by hand (`/scriptevent mycar:test`) has no id in its message. */
export function runIdFrom(message: string): string {
  const id = message.trim();
  return RUN_ID.test(id) ? id : MANUAL_RUN_ID;
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
