type Version = readonly number[];

interface Manifest {
  header: { uuid: string; version: Version; [key: string]: unknown };
  modules: { version: Version; [key: string]: unknown }[];
  dependencies: { uuid?: string; version: Version | string }[];
  [key: string]: unknown;
}

export const DEV_PATCH_BASE: number;
export const RESOURCE_PACK_UUID: string;

export function readCounter(stateText: string | undefined): number;

export function devPackVersion(
  committedVersion: Version,
  counter: number,
): number[];

export function rewriteResourcePack<T extends Manifest>(
  manifest: T,
  version: Version,
): T;

export function rewriteBehaviorPack<T extends Manifest>(
  manifest: T,
  version: Version,
): T;

export function writeDevManifests(options: {
  packsDir: string;
  dataDir: string;
}): { version: number[]; resourcePack: Manifest; behaviorPack: Manifest };
