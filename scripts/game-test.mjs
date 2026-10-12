import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  LOG_TAG,
  linesOfRun,
  shardFrom,
  summaryOfRun,
  summaryPassed,
  TEST_EVENT,
} from "../src/test-pack/protocol.ts";

const CONTAINER = "yasuflatland-ride-bds";
const runId = randomBytes(4).toString("hex");
// GAME_TEST_SHARD=2/3 runs the second of three slices of the suite, so CI can
// spread it over parallel jobs, each with its own BDS.
const shardText = process.env.GAME_TEST_SHARD ?? "";
if (shardText !== "" && !shardFrom(shardText)) {
  console.error(`GAME_TEST_SHARD must look like 2/3, got ${shardText}`);
  process.exit(1);
}
const since = new Date().toISOString();
// Write the command to bedrock_server's stdin ourselves, as Mojang's Creator
// Tools does with the process it spawns. The image's send-command cannot be
// used on Linux CI: there bedrock_server runs as the runner's UID under a root
// PID 1, and send-command's `find /proc` fails on whichever of them the exec
// user may not inspect. cmdline and the owner of /proc/<pid> are readable by
// anyone, so find the process that way, then write as its owner. The pattern
// skips this shell and mc-server-runner, whose arguments also name the binary.
const FIND_SERVER = `
for d in /proc/[0-9]*; do
  [ "\${d#/proc/}" = "$$" ] && continue
  case " $(tr '\\0' ' ' < "$d/cmdline" 2>/dev/null)" in
    *mc-server-runner*) ;;
    *" ./bedrock_server-"*) stat -c "\${d#/proc/} %u:%g" "$d"; exit 0 ;;
  esac
done
echo "bedrock_server process not found" >&2
exit 1
`;
const [serverPid, serverUser] = execFileSync(
  "docker",
  ["exec", CONTAINER, "sh", "-c", FIND_SERVER],
  { encoding: "utf8" },
)
  .trim()
  .split(" ");
execFileSync("docker", [
  "exec",
  "--user",
  serverUser,
  CONTAINER,
  "sh",
  "-c",
  'echo "$1" > "/proc/$2/fd/0"',
  "sh",
  `scriptevent ${TEST_EVENT} ${runId} ${shardText}`.trimEnd(),
  serverPid,
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
