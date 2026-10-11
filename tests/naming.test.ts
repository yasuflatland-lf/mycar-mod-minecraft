import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

// Resolved from this file rather than cwd so a different vitest --root cannot
// empty the file list and make the check pass vacuously.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HISTORICAL_DOCS = /^docs\/(adr|releases|superpowers)\//;

it("keeps the former namespace only in historical documents", () => {
  const oldName = ["my", "car"].join("");
  const oldNamespace = ["yasu", "flatland"].join("");
  const staleNamespace = new RegExp(`${oldNamespace}(?!-ride|-lf)`);
  const staleDisplayName = ["Yasuflatland", "Add-on"].join(" ");
  const currentAdrs = /^docs\/adr\/004[67]-/;
  // Untracked files that are not ignored count too, so a file added before its
  // first commit is checked like the rest (ADR 0047).
  const files = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  expect(files.length).toBeGreaterThan(0);
  const violations: string[] = [];
  for (const file of new Set(files)) {
    const path = join(REPO_ROOT, file);
    if (!existsSync(path)) continue;
    if (HISTORICAL_DOCS.test(file) && !currentAdrs.test(file)) continue;
    const historicalName = currentAdrs.test(file);
    if (
      (!historicalName && file.includes(oldName)) ||
      staleNamespace.test(file)
    )
      violations.push(`${file}: path`);
    const content = readFileSync(path);
    if (content.includes(0)) continue;
    const lines = content.toString("utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      if (
        (!historicalName && line.includes(oldName)) ||
        staleNamespace.test(line) ||
        line.includes(staleDisplayName)
      ) {
        violations.push(`${file}:${index + 1}: ${line}`);
      }
    }
  }
  expect(violations, violations.join("\n")).toEqual([]);
});
