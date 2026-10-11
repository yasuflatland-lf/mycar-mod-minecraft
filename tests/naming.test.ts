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
    if (HISTORICAL_DOCS.test(file)) continue;
    if (file.includes(oldName)) violations.push(`${file}: path`);
    const path = join(REPO_ROOT, file);
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      if (line.includes(oldName)) {
        violations.push(`${file}:${index + 1}: ${line}`);
      }
    }
  }
  expect(violations, violations.join("\n")).toEqual([]);
});
