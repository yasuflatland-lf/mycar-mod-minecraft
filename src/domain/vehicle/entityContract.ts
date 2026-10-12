export type PropertySpec =
  | { type: "enum"; values: readonly string[] }
  | { type: "float"; range: readonly [number, number] }
  | { type: "bool" };

export interface EntityContract {
  properties: Readonly<Record<string, PropertySpec>>;
  events: readonly string[];
  animations: readonly string[];
  /** Properties read back when the aggregate is rebuilt; a subset of properties. */
  restored: readonly string[];
}

/** Names the core writes; no kind may declare them. */
export const CORE_PROPERTY_NAMES: readonly string[] = ["headlights"];
export const CORE_EVENT_PREFIXES: readonly string[] = ["paint_"];
