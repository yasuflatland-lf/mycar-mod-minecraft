import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps the former namespace only in historical documents", () => {
  const oldName = ["my", "car"].join("");
  // Untracked files that are not ignored count too, so a file added before its
  // first commit is checked like the rest (ADR 0047).
  const files = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  ).split("\0");
  const violations: string[] = [];
  for (const file of new Set(files)) {
    if (
      !file ||
      /^(docs\/adr\/|docs\/releases\/|docs\/superpowers\/)/.test(file)
    ) {
      continue;
    }
    if (file.includes(oldName)) {
      violations.push(`${file}: path`);
    }
    if (!existsSync(file)) continue;
    const lines = readFileSync(file).toString("utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      if (line.includes(oldName)) {
        violations.push(`${file}:${index + 1}: ${line}`);
      }
    }
  }
  expect(violations, violations.join("\n")).toEqual([]);
});
