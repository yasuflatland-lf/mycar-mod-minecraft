// noUncheckedIndexedAccess types every index as T | undefined. This fails the
// test with a message instead of hiding the gap behind a non-null assertion.
export function defined<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} is undefined`);
  return value;
}
