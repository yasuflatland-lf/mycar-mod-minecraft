import { execFileSync } from "node:child_process";

const CONTAINER = "mycar-bds";
const since = new Date().toISOString();
execFileSync("docker", [
  "exec",
  CONTAINER,
  "send-command",
  "scriptevent mycar:test",
]);
const deadline = Date.now() + 5 * 60_000;
let summary;
let lines = [];
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 3000));
  const logs = execFileSync("docker", ["logs", "--since", since, CONTAINER], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  lines = logs.split("\n").filter((l) => l.includes("[MYCAR-TEST]"));
  summary = lines.find((l) => l.includes("SUMMARY"));
  if (summary) break;
}
for (const l of lines) console.log(l.slice(l.indexOf("[MYCAR-TEST]")));
if (!summary) {
  console.error("timed out waiting for [MYCAR-TEST] SUMMARY");
  process.exit(1);
}
process.exit(/fail=0\b/.test(summary) ? 0 : 1);
