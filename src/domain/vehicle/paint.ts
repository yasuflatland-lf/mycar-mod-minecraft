// Body colors a vehicle can be painted with dye (ADR 0031). A placed vehicle starts khaki.
// The order is the minecraft:variant index that vehicles in existing worlds store and that the paint
// events and render controller map to, so new paints go at the end.
export const PAINTS = [
  "khaki",
  "green",
  "red",
  "white",
  "light_gray",
  "gray",
  "black",
  "orange",
  "yellow",
  "lime",
  "cyan",
  "light_blue",
  "blue",
  "purple",
  "magenta",
  "pink",
] as const;
export type Paint = (typeof PAINTS)[number];
