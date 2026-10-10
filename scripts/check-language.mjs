// Enforces the English-only rule in AGENTS.md by rejecting Japanese and other CJK text.
//
//   node scripts/check-language.mjs            check every tracked or unignored file
//   node scripts/check-language.mjs <file>...  check only the given files
//   node scripts/check-language.mjs --hook     Claude Code PostToolUse hook: read the
//                                              edited path from stdin, exit 2 on failure
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

// Built from code points so that this file stays free of the characters it rejects.
const CJK_RANGES = [
  [0x3000, 0x303f], // CJK symbols and punctuation
  [0x3040, 0x30ff], // Hiragana, Katakana
  [0x31f0, 0x31ff], // Katakana phonetic extensions
  [0x3400, 0x4dbf], // CJK unified ideographs extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xff00, 0xffef], // Halfwidth and fullwidth forms
];
const CJK = new RegExp(
  `[${CJK_RANGES.map(([from, to]) => `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`).join("")}]`,
  "u",
);

// Resource Pack translations for non-English locales are supposed to hold translated text.
const ALLOWED = [/(^|\/)texts\/(?!en_)[^/]+\.lang$/];

const MAX_LINES_PER_FILE = 5;

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function isIgnored(relPath) {
  try {
    git(["check-ignore", "-q", "--", relPath]);
    return true;
  } catch {
    return false;
  }
}

function findViolations(relPath) {
  if (ALLOWED.some((re) => re.test(relPath))) return [];
  const absPath = path.join(root, relPath);
  if (!existsSync(absPath)) return [];
  const buf = readFileSync(absPath);
  if (buf.includes(0)) return [];
  return buf
    .toString("utf8")
    .split("\n")
    .flatMap((text, i) =>
      CJK.test(text) ? [`${relPath}:${i + 1}: ${text.trim()}`] : [],
    );
}

function report(relPaths) {
  const lines = [];
  for (const relPath of relPaths) {
    const found = findViolations(relPath);
    lines.push(...found.slice(0, MAX_LINES_PER_FILE));
    if (found.length > MAX_LINES_PER_FILE) {
      lines.push(
        `${relPath}: ...and ${found.length - MAX_LINES_PER_FILE} more lines`,
      );
    }
  }
  return lines;
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

const HINT =
  "Code, comments, and docs in this repository must be in English (see AGENTS.md).";

const args = process.argv.slice(2);

if (args[0] === "--hook") {
  let input = {};
  try {
    input = JSON.parse(readStdin() || "{}");
  } catch {
    process.exit(0);
  }
  const filePath =
    input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!filePath) process.exit(0);
  const relPath = path.relative(root, path.resolve(filePath));
  if (relPath.startsWith("..") || path.isAbsolute(relPath)) process.exit(0);
  if (isIgnored(relPath)) process.exit(0);
  const lines = report([relPath]);
  if (lines.length > 0) {
    console.error(
      [`${HINT} Rewrite these lines in English:`, ...lines].join("\n"),
    );
    process.exit(2);
  }
  process.exit(0);
}

const relPaths =
  args.length > 0
    ? args.map((p) => path.relative(root, path.resolve(p)))
    : git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
        .split("\0")
        .filter(Boolean);

const lines = report(relPaths);
if (lines.length > 0) {
  console.error([HINT, ...lines].join("\n"));
  process.exit(1);
}
