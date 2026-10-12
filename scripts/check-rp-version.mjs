// Fail a release when the Resource Pack changed since the previous release tag
// but kept its version: devices keep a cached Resource Pack with the same UUID
// and version, so they would never see the change (ADR 0015).
// Usage: node scripts/check-rp-version.mjs <previous tag>
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PACK = "packs/yasu_ride_rp";

export function checkResourcePackVersion({
  tag,
  changed,
  previousVersion,
  currentVersion,
}) {
  if (!tag || !changed) return null;
  const previous = previousVersion.join(".");
  const current = currentVersion.join(".");
  if (previous !== current) return null;
  return `${PACK} changed since ${tag}, but its version is ${previous} at ${tag} and ${current} at HEAD; bump header.version, the module version, and the Behavior Pack's dependency on it (ADR 0015)`;
}

// Pipe stderr so a failing command's error message ends with git's own reason
// (execFileSync appends captured stderr to "Command failed: git ...").
export function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function manifestAt(revision, dir) {
  try {
    return JSON.parse(git("show", `${revision}:${dir}/manifest.json`));
  } catch {
    return undefined;
  }
}

function treesDiffer(left, right) {
  try {
    git("diff", "--quiet", left, right);
    return false;
  } catch (error) {
    if (error.status !== 1) throw error;
    return true;
  }
}

function main(tag) {
  if (!tag) {
    console.log("No previous release tag; skipping the Resource Pack check");
    return;
  }
  const current = manifestAt("HEAD", PACK);
  // Packs keep their UUID across folder renames (the Resource Pack moved to
  // packs/yasu_ride_rp after v0.5.0), so find the previous copy by UUID.
  const previousDir = git("ls-tree", "-d", "--name-only", tag, "packs/")
    .split("\n")
    .filter(Boolean)
    .find((dir) => manifestAt(tag, dir)?.header.uuid === current.header.uuid);
  if (!previousDir) {
    console.log(`${PACK} did not exist at ${tag}; skipping the check`);
    return;
  }
  const changed = treesDiffer(`${tag}:${previousDir}`, `HEAD:${PACK}`);
  const failure = checkResourcePackVersion({
    tag,
    changed,
    previousVersion: manifestAt(tag, previousDir).header.version,
    currentVersion: current.header.version,
  });
  if (failure) {
    console.error(`::error::${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    changed
      ? `${PACK} changed since ${tag} and its version was bumped`
      : `${PACK} is unchanged since ${tag}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv[2]);
}
