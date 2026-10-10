import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  LOG_TAG,
  linesOfRun,
  summaryOfRun,
  summaryPassed,
  TEST_EVENT,
} from "../src/test-pack/protocol.ts";

const CONTAINER = "mycar-bds";
const runId = randomBytes(4).toString("hex");
const since = new Date().toISOString();
execFileSync("docker", [
  "exec",
  CONTAINER,
  "send-command",
  `scriptevent ${TEST_EVENT} ${runId}`,
]);
const deadline = Date.now() + 5 * 60_000;
let summary;
let lines = [];
while (Date.now() < deadline) {
  await sleep(3000);
  const logs = execFileSync("docker", ["logs", "--since", since, CONTAINER], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const all = logs.split("\n");
  lines = linesOfRun(all, runId);
  summary = summaryOfRun(all, runId);
  if (summary) break;
}
for (const l of lines) console.log(l.slice(l.indexOf(LOG_TAG)));
if (!summary) {
  console.error(`timed out waiting for ${LOG_TAG} ${runId} SUMMARY`);
  process.exit(1);
}
process.exit(summaryPassed(summary) ? 0 : 1);
