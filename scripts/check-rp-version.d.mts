export function checkResourcePackVersion(options: {
  tag: string | undefined;
  changed: boolean;
  previousVersion: readonly number[];
  currentVersion: readonly number[];
}): string | null;
