/** Prefix of every ID this add-on defines. */
export const NAMESPACE = "yasuflatland";
export function id(name: string): string {
  return `${NAMESPACE}:${name}`;
}
