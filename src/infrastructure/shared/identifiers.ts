/** Prefix of every ID this add-on defines. */
export const NAMESPACE = "yasu_ride";
export function id(name: string): string {
  return `${NAMESPACE}:${name}`;
}
