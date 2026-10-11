/** Prefix of every ID this add-on defines. */
export const NAMESPACE = "mycar";
export function id(name: string): string {
  return `${NAMESPACE}:${name}`;
}
