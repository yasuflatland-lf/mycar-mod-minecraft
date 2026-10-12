/** Prefix of every ID this add-on defines. */
const NAMESPACE = "mycar";
export function id(name: string): string {
  return `${NAMESPACE}:${name}`;
}
