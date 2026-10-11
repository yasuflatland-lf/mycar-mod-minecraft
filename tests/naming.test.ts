import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps the former namespace only in historical documents", () => {
  const oldName = ["my", "car"].join("");
  const files = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
  }).split("\0");
  const violations: string[] = [];
  for (const file of new Set(files)) {
    if (
      !file ||
      !existsSync(file) ||
      /^(docs\/adr\/|docs\/releases\/|docs\/superpowers\/)/.test(file)
    ) {
      continue;
    }
    const lines = readFileSync(file).toString("utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      if (line.includes(oldName)) {
        violations.push(`${file}:${index + 1}: ${line}`);
      }
    }
  }
  expect(violations, violations.join("\n")).toEqual([]);
});
