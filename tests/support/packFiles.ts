import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Json = Record<string, unknown>;

export function packFiles(dir: string): string[] {
  const walk = (folders: string[]): string[] =>
    readdirSync(join(dir, ...folders), { withFileTypes: true }).flatMap(
      (entry) => {
        // Only the pack-root scripts directory is generated build output.
        if (
          folders.length === 0 &&
          entry.isDirectory() &&
          entry.name === "scripts"
        ) {
          return [];
        }
        // Finder drops .DS_Store into folders it opens; .gitignore and the
        // package zip already skip it.
        if (entry.name === ".DS_Store") return [];
        const parts = [...folders, entry.name];
        if (entry.isDirectory()) return walk(parts);
        return entry.isFile() ? [parts.join("/")] : [];
      },
    );
  return walk([]).sort();
}

export function jsonFileEntries(dir: string): { path: string; json: Json }[] {
  return packFiles(dir)
    .filter((path) => path.endsWith(".json"))
    .map((path) => ({
      path,
      json: JSON.parse(readFileSync(join(dir, path), "utf8")) as Json,
    }));
}

export function jsonFiles(dir: string): Json[] {
  return jsonFileEntries(dir).map(({ json }) => json);
}
